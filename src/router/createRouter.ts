import type { Mesh, Unsubscribe } from "../core/types";
import type { FlatRoute } from "./matchRoutes";
import type {
  MeshRouter,
  NavigationTarget,
  NavigationContext,
  PredictivePrefetchOptions,
  RedirectError,
  RouteAnalyticsEvent,
  RouteDefinition,
  RouteErrorRecovery,
  RouteGuard,
  RouteHistoryEntry,
  RouteMatch,
  RouteMiddleware,
  RouterOptions,
  RouterState,
  AnalyticsOptions
} from "./types";
import { RedirectError as RedirectErrorClass } from "./types";
import { createBrowserHistory, createMemoryHistory, type HistoryAdapter, type HistoryLocation } from "./historyAdapter";
import { flattenRoutes, matchRoutes, interpolatePath, normalizePath, parseSearch, buildPath } from "./matchRoutes";
import { backoff } from "../utils/backoff";

// Cast helper — Mesh<TState> is assignable to Mesh at runtime, the generic is only for type-safe getState/setState
function asMesh<T>(mesh: Mesh<T>): Mesh {
  return mesh as unknown as Mesh;
}

const ROUTER_EVENT_TYPES = {
  NAVIGATION: "router.navigation" as const,
  MATCH: "router.match" as const
};

/**
 * Create a router instance bound to a mesh.
 */
export function createRouter<TState = unknown>(
  mesh: Mesh<TState>,
  routes: RouteDefinition[],
  options: RouterOptions = {}
): MeshRouter<TState> {
  const basename = options.basename ?? "";
  const defaultPendingMs = options.defaultPendingMs ?? 200;
  const defaultPendingMinMs = options.defaultPendingMinMs ?? 300;
  const scrollRestoration = options.scrollRestoration ?? false;

  // History adapter
  const history: HistoryAdapter = typeof window !== "undefined"
    ? createBrowserHistory(basename)
    : createMemoryHistory("/");

  // Flattened routes for matching
  const flatRoutes: FlatRoute[] = flattenRoutes(routes);

  // Middleware and guard chains
  const middlewares: RouteMiddleware<TState>[] = [];
  const guards: RouteGuard<TState>[] = [];

  // Router state
  const state: RouterState = {
    current: null,
    pending: null,
    status: "idle",
    history: []
  };

  const listeners = new Set<() => void>();
  const scrollPositions = new Map<string, number>();
  let pendingController: AbortController | null = null;
  let navigationId = 0;

  // Keep-alive pool
  const keepAlivePool = new Map<string, { match: RouteMatch; timestamp: number }>();
  const keepAliveMax = options.keepAlive?.maxRoutes ?? 5;
  const keepAliveStrategy = options.keepAlive?.strategy ?? "lru";

  // Predictive prefetch
  const navigationGraph = new Map<string, Map<string, number>>();
  const prefetchCache = new Map<string, { prefetched: boolean; timestamp: number }>();

  // Analytics
  let analyticsStartTime: number | null = null;
  let analyticsMaxScroll = 0;
  const analyticsEvents: RouteAnalyticsEvent[] = [];

  // Initial match
  function initialize(): void {
    const location = history.getLocation();
    const match = matchLocation(location);
    if (match) {
      state.current = match;
      runLoader(match).catch(() => undefined);
    }

    history.listen((location, action) => {
      const match = matchLocation(location);
      if (!match) return;

      const from = state.current;
      const method = action === "pop" ? "back" : action;
      performNavigation(match, { method: method as RouteHistoryEntry["method"] });
    });
  }

  function matchLocation(location: HistoryLocation): RouteMatch | null {
    const match = matchRoutes(flatRoutes, location.pathname);
    if (match) {
      match.search = parseSearch(location.search);
      // Apply search validation/defaults
      const route = match.route;
      if (route.validateSearch) {
        match.search = route.validateSearch(match.search as Record<string, string>);
      }
      if (route.defaultSearch) {
        match.search = { ...route.defaultSearch, ...match.search };
      }
    }
    return match;
  }

  async function performNavigation(
    target: RouteMatch,
    navOptions: { method: RouteHistoryEntry["method"]; replace?: boolean } = { method: "push" }
  ): Promise<void> {
    const navId = ++navigationId;
    const from = state.current;
    const startTime = Date.now();

    // Cancel previous pending navigation
    if (pendingController) {
      pendingController.abort();
    }
    const controller = new AbortController();
    pendingController = controller;

    // Save scroll position
    if (scrollRestoration && from) {
      scrollPositions.set(from.fullPath, window?.scrollY ?? 0);
    }

    // Update state to pending
    state.pending = target;
    state.status = "loading";
    notify();

    // Analytics
    if (options.analytics?.enabled) {
      trackAnalyticsEvent(from, target, navOptions.method, startTime);
    }

    // Run middleware pipeline
    try {
      const context: NavigationContext<TState> = {
        mesh,
        match: target,
        signal: controller.signal,
        abort: () => controller.abort()
      };

      for (const middleware of middlewares) {
        if (controller.signal.aborted) break;
        const result = await middleware(target, from, context);
        if (result === false) {
          // Navigation blocked by middleware
          state.pending = null;
          state.status = "idle";
          notify();
          return;
        }
      }

      // Run guards
      for (const guard of guards) {
        if (controller.signal.aborted) break;
        await guard(target, from, context);
      }

      // Run route-level beforeLoad
      for (const route of target.route.children ? [target.route] : [target.route]) {
        if (route.beforeLoad) {
          await route.beforeLoad({
            params: target.params,
            search: target.search as Record<string, string>,
            mesh: asMesh(mesh)
          });
        }
      }

      // Run loader
      await runLoader(target, controller.signal);

      // Check if this navigation was superseded
      if (navId !== navigationId) return;

      // Commit navigation
      const finishedAt = Date.now();
      state.current = target;
      state.pending = null;
      state.status = "idle";

      // Update history
      if (navOptions.replace) {
        history.replace(interpolatePath(target.fullPath, target.params, target.search as Record<string, unknown>));
      } else {
        history.push(interpolatePath(target.fullPath, target.params, target.search as Record<string, unknown>));
      }

      // Record in history
      state.history.push({
        from: from?.fullPath ?? "",
        to: target.fullPath,
        timestamp: finishedAt,
        duration: finishedAt - startTime,
        method: navOptions.method
      });

      // Keep-alive: store in pool
      if (options.keepAlive) {
        addToKeepAlivePool(target);
      }

      // Predictive prefetch: record navigation and prefetch likely next routes
      if (options.predictivePrefetch?.enabled && from) {
        recordNavigation(from.fullPath, target.fullPath);
        prefetchLikelyRoutes(target.fullPath, options.predictivePrefetch);
      }

      // Scroll restoration
      if (scrollRestoration) {
        const savedScroll = scrollPositions.get(target.fullPath);
        if (savedScroll !== undefined) {
          requestAnimationFrame(() => window?.scrollTo(0, savedScroll));
        } else {
          requestAnimationFrame(() => window?.scrollTo(0, 0));
        }
      }

      notify();
    } catch (error) {
      if (controller.signal.aborted) return;

      const wrapped = error instanceof Error ? error : new Error(String(error));

      // Handle redirect
      if (wrapped instanceof RedirectErrorClass) {
        const redirectErr = wrapped as RedirectError;
        const redirectPath = buildPath(redirectErr.target, redirectErr.params ?? {});
        const redirectMatch = matchRoutes(flatRoutes, redirectPath);
        if (redirectMatch) {
          redirectMatch.search = redirectErr.search ?? {};
          await performNavigation(redirectMatch, { method: "replace", replace: true });
          return;
        }
      }

      // Error recovery with retry
      const route = target.route;
      if (route.errorRecovery && route.errorRecovery.retry && route.errorRecovery.retry > 0) {
        const recovered = await attemptErrorRecovery(target, route.errorRecovery, wrapped);
        if (recovered) return;
      }

      // Navigation rollback if enabled
      if (route.rollback) {
        state.pending = null;
        state.status = "idle";
        target.error = wrapped;
        notify();
        return;
      }

      // Normal error — set error on match and commit
      state.current = target;
      state.current.error = wrapped;
      state.pending = null;
      state.status = "error";
      notify();
    } finally {
      if (navId === navigationId) {
        pendingController = null;
      }
    }
  }

  async function runLoader(match: RouteMatch, signal?: AbortSignal): Promise<void> {
    match.pending = true;
    match.error = null;

    try {
      if (match.route.loader) {
        match.loaderData = await match.route.loader({
          params: match.params,
          search: match.search as Record<string, string>,
          mesh: asMesh(mesh),
          signal: signal ?? new AbortController().signal
        });
      }

      // Resolve meta
      if (typeof match.route.meta === "function") {
        match.meta = match.route.meta(match);
      } else if (match.route.meta) {
        match.meta = match.route.meta;
      }

      // Run dependencies in parallel
      if (match.route.dependencies) {
        const depEntries = Object.entries(match.route.dependencies);
        await Promise.all(
          depEntries.map(async ([key, fn]) => {
            try {
              const data = await fn(match.params, asMesh(mesh));
              (match as Record<string, unknown>)[`dep:${key}`] = data;
            } catch {
              // Dependencies are best-effort
            }
          })
        );
      }
    } catch (error) {
      match.error = error instanceof Error ? error : new Error(String(error));
      throw error;
    } finally {
      match.pending = false;
    }
  }

  async function attemptErrorRecovery(
    match: RouteMatch,
    recovery: RouteErrorRecovery,
    error: Error
  ): Promise<boolean> {
    const maxRetries = recovery.retry ?? 0;
    const delayFn = typeof recovery.retryDelay === "function"
      ? recovery.retryDelay
      : recovery.retryDelay
        ? () => recovery.retryDelay as number
        : backoff();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (recovery.onError) {
        const action = recovery.onError(error, attempt);
        if (action === "fallback") break;
      }

      await sleep(delayFn(attempt, error));

      try {
        await runLoader(match);
        // Success — commit the navigation
        state.current = match;
        state.pending = null;
        state.status = "idle";
        notify();
        return true;
      } catch (retryError) {
        error = retryError instanceof Error ? retryError : new Error(String(retryError));
      }
    }

    return false;
  }

  // Analytics
  function trackAnalyticsEvent(
    from: RouteMatch | null,
    to: RouteMatch,
    method: RouteHistoryEntry["method"],
    startTime: number
  ): void {
    const opts = options.analytics;
    if (!opts?.enabled) return;

    // Time on previous page
    if (from && analyticsStartTime && opts.trackTimeOnPage !== false) {
      const duration = startTime - analyticsStartTime;
      emitAnalyticsEvent({
        name: "route.time_on_page",
        properties: { path: from.fullPath, duration },
        timestamp: Date.now()
      });
    }

    // Scroll depth of previous page
    if (from && opts.trackScrollDepth && analyticsMaxScroll > 0) {
      emitAnalyticsEvent({
        name: "route.scroll_depth",
        properties: { path: from.fullPath, maxScroll: analyticsMaxScroll },
        timestamp: Date.now()
      });
    }

    // Page view
    if (opts.trackPageViews !== false) {
      emitAnalyticsEvent({
        name: "route.page_view",
        properties: {
          path: to.fullPath,
          title: to.meta.title ?? to.fullPath,
          search: to.search,
          referrer: from?.fullPath ?? ""
        },
        timestamp: Date.now()
      });
    }

    // Navigation
    if (opts.trackNavigationFunnels) {
      emitAnalyticsEvent({
        name: "route.navigation",
        properties: {
          from: from?.fullPath ?? "",
          to: to.fullPath,
          method,
          duration: Date.now() - startTime
        },
        timestamp: Date.now()
      });
    }

    // Bounce detection
    if (from && state.history.length > 0) {
      const lastEntry = state.history[state.history.length - 1];
      if (lastEntry && lastEntry.from === "" && Date.now() - lastEntry.timestamp < 3000) {
        emitAnalyticsEvent({
          name: "route.bounce",
          properties: { path: from.fullPath, duration: Date.now() - lastEntry.timestamp },
          timestamp: Date.now()
        });
      }
    }

    analyticsStartTime = startTime;
    analyticsMaxScroll = 0;
  }

  function emitAnalyticsEvent(event: RouteAnalyticsEvent): void {
    analyticsEvents.push(event);
    options.analytics?.onEvent?.(event);
  }

  // Predictive prefetch
  function recordNavigation(from: string, to: string): void {
    let fromMap = navigationGraph.get(from);
    if (!fromMap) {
      fromMap = new Map();
      navigationGraph.set(from, fromMap);
    }
    fromMap.set(to, (fromMap.get(to) ?? 0) + 1);
  }

  function prefetchLikelyRoutes(currentPath: string, opts: PredictivePrefetchOptions): void {
    const fromMap = navigationGraph.get(currentPath);
    if (!fromMap) return;

    const total = [...fromMap.values()].reduce((sum, count) => sum + count, 0);
    if (total === 0) return;

    const topN = opts.topN ?? 2;
    const minProb = opts.minProbability ?? 0.3;

    const sorted = [...fromMap.entries()]
      .map(([path, count]) => ({ path, probability: count / total }))
      .filter((entry) => entry.probability >= minProb)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, topN);

    for (const entry of sorted) {
      const cached = prefetchCache.get(entry.path);
      if (cached?.prefetched) continue;

      prefetchCache.set(entry.path, { prefetched: true, timestamp: Date.now() });

      // Prefetch the route's component and loader
      const match = matchRoutes(flatRoutes, entry.path);
      if (match && typeof match.route.loader === "function") {
        const loader = match.route.loader;
        Promise.resolve(loader({
          params: match.params,
          search: match.search,
          mesh: asMesh(mesh),
          signal: new AbortController().signal
        })).catch(() => undefined);
      }
    }
  }

  // Keep-alive pool
  function addToKeepAlivePool(match: RouteMatch): void {
    if (match.route.keepAlive) {
      keepAlivePool.set(match.fullPath, { match, timestamp: Date.now() });

      // Evict if over limit
      if (keepAlivePool.size > keepAliveMax) {
        let oldest: string | null = null;
        let oldestTime = Infinity;

        for (const [key, entry] of keepAlivePool) {
          if (entry.timestamp < oldestTime) {
            oldestTime = entry.timestamp;
            oldest = key;
          }
        }

        if (oldest) {
          keepAlivePool.delete(oldest);
        }
      }
    }
  }

  // Navigation methods
  async function navigate(to: string, navOptions: Omit<NavigationTarget, "to"> = {}): Promise<void> {
    const pathname = buildPath(to, navOptions.params ?? {});
    const match = matchRoutes(flatRoutes, pathname);
    if (!match) {
      // Try 404 route
      const notFound = matchRoutes(flatRoutes, "*");
      if (notFound) {
        notFound.search = navOptions.search ?? {};
        await performNavigation(notFound, {
          method: "push",
          replace: navOptions.replace
        });
      }
      return;
    }

    match.search = navOptions.search ?? {};
    await performNavigation(match, {
      method: navOptions.replace ? "replace" : "push",
      replace: navOptions.replace
    });
  }

  function back(): void {
    history.back();
  }

  function forward(): void {
    history.forward();
  }

  async function replace(to: string, navOptions: Omit<NavigationTarget, "to"> = {}): Promise<void> {
    await navigate(to, { ...navOptions, replace: true });
  }

  // Middleware and guards
  function use(middleware: RouteMiddleware<TState>): Unsubscribe {
    middlewares.push(middleware);
    return () => {
      const index = middlewares.indexOf(middleware);
      if (index >= 0) middlewares.splice(index, 1);
    };
  }

  function beforeEach(guard: RouteGuard<TState>): Unsubscribe {
    guards.push(guard);
    return () => {
      const index = guards.indexOf(guard);
      if (index >= 0) guards.splice(index, 1);
    };
  }

  async function invalidate(): Promise<void> {
    if (state.current) {
      await runLoader(state.current);
      notify();
    }
  }

  async function preload(to: string, params: Record<string, string> = {}): Promise<void> {
    const pathname = buildPath(to, params);
    const match = matchRoutes(flatRoutes, pathname);
    if (match?.route.loader) {
      await match.route.loader({
        params: match.params,
        search: match.search as Record<string, string>,
        mesh: asMesh(mesh),
        signal: new AbortController().signal
      });
    }
  }

  function getCurrentMatch(): RouteMatch | null {
    return state.current;
  }

  function getPendingMatch(): RouteMatch | null {
    return state.pending;
  }

  function subscribe(listener: () => void): Unsubscribe {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function destroy(): void {
    listeners.clear();
    middlewares.length = 0;
    guards.length = 0;
    keepAlivePool.clear();
    prefetchCache.clear();
    navigationGraph.clear();
    if (pendingController) {
      pendingController.abort();
    }
  }

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
    // Emit mesh event
    asMesh(mesh).emit?.({
      type: "state.changed",
      path: "router",
      timestamp: Date.now(),
      metadata: {
        status: state.status,
        current: state.current?.fullPath,
        pending: state.pending?.fullPath
      }
    });
  }

  // Initialize
  initialize();

  return {
    navigate,
    back,
    forward,
    replace,
    use,
    beforeEach,
    invalidate,
    preload,
    getCurrentMatch,
    getPendingMatch,
    subscribe,
    destroy
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
