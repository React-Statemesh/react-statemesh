import type { Mesh, MeshEvent, MeshPath, MaybePromise, Unsubscribe } from "../core/types";

/** A route definition node in the route tree. */
export type RouteDefinition = {
  /** URL path pattern. Supports `:param` and `*` wildcards. */
  path: string;
  /** Unique route ID. Defaults to path. */
  id?: string;
  /** Lazy component loader or direct component. */
  component?: RouteComponentLoader;
  /** Component shown while the main component is loading. */
  pendingComponent?: RouteComponentLoader;
  /** Component shown when the route's loader throws. */
  errorComponent?: RouteComponentLoader;
  /** Data loader — runs before the component renders. Return value is available via `useMatch`. */
  loader?: RouteLoader;
  /** Run before the loader. Can throw `redirect()`. */
  beforeLoad?: RouteBeforeLoad;
  /** Static or dynamic meta for SEO and route metadata. */
  meta?: Record<string, unknown> | ((match: RouteMatch) => Record<string, unknown>);
  /** Child routes for nested layouts. */
  children?: RouteDefinition[];
  /** Whether to keep this route's component alive when navigating away. */
  keepAlive?: boolean;
  /** Isolate this route's state changes for snapshot/restore on navigation. */
  stateScope?: "route";
  /** Rollback navigation if the loader fails. */
  rollback?: boolean;
  /** Error recovery configuration. */
  errorRecovery?: RouteErrorRecovery;
  /** Data dependencies — prefetched in parallel with the loader. */
  dependencies?: Record<string, RouteDependencyFn>;
  /** Search param schema for type-safe search params. */
  validateSearch?: (search: Record<string, string>) => Record<string, unknown>;
  /** Search param defaults. */
  defaultSearch?: Record<string, unknown>;
  /** Extra static metadata. */
  staticData?: Record<string, unknown>;
};

/** Options for `mesh.router()`. */
export type RouterOptions = {
  /** Base path prefix for all routes. */
  basename?: string;
  /** Delay in ms before showing the pending component. Defaults to 200. */
  defaultPendingMs?: number;
  /** Minimum time in ms the pending component stays visible. Defaults to 300. */
  defaultPendingMinMs?: number;
  /** Restore scroll position on back/forward navigation. */
  scrollRestoration?: boolean;
  /** Preload route chunks on hover/focus. */
  preload?: "intent" | "render" | "none";
  /** Route keep-alive pool configuration. */
  keepAlive?: KeepAliveOptions;
  /** Automatic route analytics. */
  analytics?: AnalyticsOptions;
  /** Predictive prefetch configuration. */
  predictivePrefetch?: PredictivePrefetchOptions;
  /** Offline routing configuration. */
  offline?: OfflineOptions;
};

/** Configuration for the route memory pool. */
export type KeepAliveOptions = {
  /** Maximum number of routes to keep alive. Defaults to 5. */
  maxRoutes?: number;
  /** Eviction strategy when the pool is full. Defaults to "lru". */
  strategy?: "lru" | "fifo";
  /** What to persist for evicted routes. */
  persist?: Array<"forms" | "scroll" | "state">;
};

/** Configuration for automatic route analytics. */
export type AnalyticsOptions = {
  /** Enable analytics. */
  enabled?: boolean;
  /** Track page views. Defaults to true. */
  trackPageViews?: boolean;
  /** Track time spent on each page. Defaults to true. */
  trackTimeOnPage?: boolean;
  /** Track maximum scroll depth per page. Defaults to false. */
  trackScrollDepth?: boolean;
  /** Track navigation funnels. Defaults to false. */
  trackNavigationFunnels?: boolean;
  /** Called with each analytics event. */
  onEvent?: (event: RouteAnalyticsEvent) => void;
};

/** An analytics event emitted by the router. */
export type RouteAnalyticsEvent = {
  /** Event name. */
  name: "route.page_view" | "route.time_on_page" | "route.scroll_depth" | "route.navigation" | "route.bounce";
  /** Event properties. */
  properties: Record<string, unknown>;
  /** Timestamp in ms. */
  timestamp: number;
};

/** Configuration for predictive prefetch. */
export type PredictivePrefetchOptions = {
  /** Enable predictive prefetch. */
  enabled?: boolean;
  /** Number of top routes to prefetch. Defaults to 2. */
  topN?: number;
  /** Minimum probability threshold. Defaults to 0.3. */
  minProbability?: number;
  /** Learn from user or analytics. */
  learnFrom?: "user" | "analytics";
};

/** Configuration for offline routing. */
export type OfflineOptions = {
  /** Enable offline routing. */
  enabled?: boolean;
  /** Cache strategy. Defaults to "cache-first". */
  strategy?: "cache-first" | "network-first";
  /** Routes to precache for offline use. */
  cacheRoutes?: string[];
  /** Fallback route when no cache exists. */
  fallbackRoute?: string;
};

/** Configuration for error recovery. */
export type RouteErrorRecovery = {
  /** Number of retries before showing the error component. */
  retry?: number;
  /** Delay between retries. Accepts a number or the `backoff()` helper. */
  retryDelay?: number | ((attempt: number) => number);
  /** Component shown during retries. */
  fallbackComponent?: RouteComponentLoader;
  /** Called on each error. Return "retry" to continue or "fallback" to stop. */
  onError?: (error: Error, attempt: number) => "retry" | "fallback";
};

/** A resolved route match. */
export type RouteMatch = {
  /** Matched route definition. */
  route: RouteDefinition;
  /** Extracted path params. */
  params: Record<string, string>;
  /** Parsed search params. */
  search: Record<string, unknown>;
  /** Full matched path. */
  fullPath: string;
  /** Loader data, if the loader has run. */
  loaderData: unknown;
  /** Loader error, if the loader threw. */
  error: Error | null;
  /** Whether the loader is currently running. */
  pending: boolean;
  /** Route metadata from `meta`. */
  meta: Record<string, unknown>;
};

/** Navigation target. */
export type NavigationTarget = {
  /** Target path. */
  to: string;
  /** Path params. */
  params?: Record<string, string>;
  /** Search params. */
  search?: Record<string, unknown>;
  /** Replace current history entry instead of pushing. */
  replace?: boolean;
  /** Custom state for history. */
  state?: unknown;
};

/** Navigation context passed to loaders and guards. */
export type NavigationContext<TState = unknown> = {
  /** The mesh instance. */
  mesh: Mesh<TState>;
  /** Current route match. */
  match: RouteMatch;
  /** Abort signal for the navigation. */
  signal: AbortSignal;
  /** Abort the navigation. */
  abort: () => void;
};

/** Middleware function for the route pipeline. */
export type RouteMiddleware<TState = unknown> = (
  to: RouteMatch,
  from: RouteMatch | null,
  context: NavigationContext<TState>
) => MaybePromise<void | boolean>;

/** Guard function registered with `router.beforeEach`. */
export type RouteGuard<TState = unknown> = (
  to: RouteMatch,
  from: RouteMatch | null,
  context: NavigationContext<TState>
) => MaybePromise<void>;

/** Loader function for a route. */
export type RouteLoader = (
  context: { params: Record<string, string>; search: Record<string, unknown>; mesh: Mesh; signal: AbortSignal }
) => MaybePromise<unknown>;

/** Before-load function for a route. */
export type RouteBeforeLoad = (
  context: { params: Record<string, string>; search: Record<string, unknown>; mesh: Mesh }
) => MaybePromise<void>;

/** A dependency function for parallel data loading. */
export type RouteDependencyFn = (
  params: Record<string, string>,
  mesh: Mesh
) => MaybePromise<unknown>;

/** Lazy component loader. */
export type RouteComponentLoader = () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>;

/** The router instance returned by `mesh.router()`. */
export type MeshRouter<TState = unknown> = {
  /** Navigate to a target. */
  navigate: (to: string, options?: Omit<NavigationTarget, "to">) => Promise<void>;
  /** Go back in history. */
  back: () => void;
  /** Go forward in history. */
  forward: () => void;
  /** Replace the current history entry. */
  replace: (to: string, options?: Omit<NavigationTarget, "to">) => Promise<void>;
  /** Register a middleware function. */
  use: (middleware: RouteMiddleware<TState>) => Unsubscribe;
  /** Register a guard that runs before every navigation. */
  beforeEach: (guard: RouteGuard<TState>) => Unsubscribe;
  /** Invalidate and refetch data for the current route. */
  invalidate: () => Promise<void>;
  /** Preload a route's component and data. */
  preload: (to: string, params?: Record<string, string>) => Promise<void>;
  /** Get the current route match. */
  getCurrentMatch: () => RouteMatch | null;
  /** Get the pending route match (during navigation). */
  getPendingMatch: () => RouteMatch | null;
  /** Subscribe to route changes. */
  subscribe: (listener: () => void) => Unsubscribe;
  /** Destroy the router and clean up listeners. */
  destroy: () => void;
};

/** Router state tracked internally. */
export type RouterState = {
  /** Current route match. */
  current: RouteMatch | null;
  /** Pending route match (during navigation). */
  pending: RouteMatch | null;
  /** Navigation status. */
  status: "idle" | "loading" | "error";
  /** Navigation history for analytics. */
  history: RouteHistoryEntry[];
};

/** One entry in the navigation history. */
export type RouteHistoryEntry = {
  /** From path. */
  from: string;
  /** To path. */
  to: string;
  /** Navigation timestamp. */
  timestamp: number;
  /** Navigation duration in ms. */
  duration: number;
  /** Navigation method. */
  method: "push" | "replace" | "back" | "forward";
};

/** The React context value for the router. */
export type RouterContextValue<TState = unknown> = {
  /** The router instance. */
  router: MeshRouter<TState>;
  /** The mesh instance. */
  mesh: Mesh<TState>;
  /** Current route match. */
  currentMatch: RouteMatch | null;
  /** Pending route match. */
  pendingMatch: RouteMatch | null;
  /** Resolved route tree. */
  routes: RouteDefinition[];
};

/** Redirect error thrown by guards and loaders. */
export class RedirectError extends Error {
  readonly code = "STATEMESH_REDIRECT";
  readonly target: string;
  readonly params?: Record<string, string>;
  readonly search?: Record<string, unknown>;
  readonly replace: boolean;

  constructor(target: string, options?: { params?: Record<string, string>; search?: Record<string, unknown>; replace?: boolean }) {
    super(`Redirect to ${target}`);
    this.name = "RedirectError";
    this.target = target;
    this.params = options?.params;
    this.search = options?.search;
    this.replace = options?.replace ?? false;
  }
}

/** Create a redirect error. Use in guards and loaders. */
export function redirect(target: string, options?: { params?: Record<string, string>; search?: Record<string, unknown>; replace?: boolean }): RedirectError {
  return new RedirectError(target, options);
}
