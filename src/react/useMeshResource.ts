import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type {
  ResourceFetchOptions,
  ResourceHandle,
  ResourceInvalidation,
  ResourceSetDataOptions,
  ResourceStatus
} from "../core/types";
import { useMesh } from "./useMesh";

/** Options for `useMeshResource`. */
export type UseMeshResourceOptions = ResourceFetchOptions & {
  /** Fetch automatically on mount when the entry is idle or stale. Defaults to true. */
  auto?: boolean;
  /** Disable all automatic fetching when false. Defaults to true. */
  enabled?: boolean;
  /** Force a refetch on mount even when cached data is fresh. */
  refetchOnMount?: boolean;
  /** Refetch stale data when the browser tab becomes visible or focused. Defaults to false. */
  refetchOnWindowFocus?: boolean | "always";
  /** Refetch stale data when the browser comes back online. Defaults to false. */
  refetchOnReconnect?: boolean | "always";
  /** Poll while the resource is enabled. Disabled by default. */
  refetchInterval?: number | false;
  /** Continue polling while the tab is hidden. Defaults to false. */
  refetchIntervalInBackground?: boolean;
};

/** Value returned by `useMeshResource`. */
export type UseMeshResourceResult<TParams = void, TData = unknown> = ResourceStatus<TData, TParams> & {
  /** Fetch this resource again. */
  refetch: (options?: ResourceFetchOptions) => Promise<TData>;
  /** Warm the cache without forcing a network call when data is fresh. */
  prefetch: (options?: ResourceFetchOptions) => Promise<TData>;
  /** Fetch the next page for pagination/infinite resources. */
  fetchNextPage: (options?: ResourceFetchOptions) => Promise<TData>;
  /** Mark matching resources stale, optionally refetching. */
  invalidate: (invalidation?: ResourceInvalidation) => Promise<void>;
  /** Write cached data manually. */
  setData: (updater: TData | ((current: TData | null) => TData), options?: ResourceSetDataOptions) => void;
};

/**
 * Subscribe to a cached resource and optionally fetch it on mount.
 *
 * @example
 * ```tsx
 * const products = useMeshResource(productsResource, filters, { staleTime: "1m" });
 * ```
 */
export function useMeshResource<TParams = void, TData = unknown, TState = unknown>(
  nameOrResource: string | ResourceHandle<TParams, TData>,
  params?: TParams,
  options: UseMeshResourceOptions = {}
): UseMeshResourceResult<TParams, TData> {
  const mesh = useMesh<TState>();
  const resourceName = typeof nameOrResource === "string" ? nameOrResource : nameOrResource.resourceName;
  const paramsKey = stableHookHash(params);
  const lastStatusRef = useRef<ResourceStatus<TData, TParams> | null>(null);

  const subscribe = useCallback(
    (listener: () => void) => mesh.subscribeResource(resourceName, listener, { params }),
    [mesh, resourceName, paramsKey]
  );

  const getSnapshot = useCallback(() => {
    const next = mesh.getResourceStatus<TData, TParams>(resourceName, params);
    const previous = lastStatusRef.current;
    if (previous && resourceStatusEqual(previous, next)) return previous;
    lastStatusRef.current = next;
    return next;
  }, [mesh, resourceName, paramsKey]);

  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const enabled = options.enabled ?? true;
  const auto = options.auto ?? true;
  const forceOnMount = options.refetchOnMount ?? false;

  useEffect(() => {
    if (!enabled || !auto) return;
    const current = mesh.getResourceStatus<TData, TParams>(resourceName, params);
    if (forceOnMount || current.status === "idle" || current.stale) {
      mesh.fetchResource<TParams, TData>(resourceName, params, {
        ...options,
        force: forceOnMount || options.force,
        background: current.status === "success" || options.background
      }).catch(() => {
        // The resource status carries the error to the UI.
      });
    }
  }, [mesh, resourceName, paramsKey, enabled, auto, forceOnMount]);

  useEffect(() => {
    if (!enabled || !options.refetchOnWindowFocus || typeof window === "undefined" || typeof document === "undefined") return;

    const refetchOnFocus = () => {
      const current = mesh.getResourceStatus<TData, TParams>(resourceName, params);
      if (options.refetchOnWindowFocus === "always" || current.stale) {
        mesh.fetchResource<TParams, TData>(resourceName, params, {
          ...options,
          force: true,
          background: current.status === "success" || options.background,
          metadata: { ...options.metadata, trigger: "window-focus" }
        }).catch(() => undefined);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refetchOnFocus();
    };

    window.addEventListener("focus", refetchOnFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refetchOnFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [mesh, resourceName, paramsKey, enabled, options.refetchOnWindowFocus]);

  useEffect(() => {
    if (!enabled || !options.refetchOnReconnect || typeof window === "undefined") return;

    const onOnline = () => {
      const current = mesh.getResourceStatus<TData, TParams>(resourceName, params);
      if (options.refetchOnReconnect === "always" || current.stale) {
        mesh.fetchResource<TParams, TData>(resourceName, params, {
          ...options,
          force: true,
          background: current.status === "success" || options.background,
          metadata: { ...options.metadata, trigger: "reconnect" }
        }).catch(() => undefined);
      }
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [mesh, resourceName, paramsKey, enabled, options.refetchOnReconnect]);

  useEffect(() => {
    if (!enabled || !options.refetchInterval || options.refetchInterval <= 0 || typeof window === "undefined") return;

    const tick = () => {
      if (!options.refetchIntervalInBackground && typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const current = mesh.getResourceStatus<TData, TParams>(resourceName, params);
      mesh.fetchResource<TParams, TData>(resourceName, params, {
        ...options,
        force: true,
        background: current.status === "success" || options.background,
        metadata: { ...options.metadata, trigger: "interval" }
      }).catch(() => undefined);
    };

    const intervalId = window.setInterval(tick, options.refetchInterval);
    return () => window.clearInterval(intervalId);
  }, [mesh, resourceName, paramsKey, enabled, options.refetchInterval, options.refetchIntervalInBackground]);

  return useMemo(
    () => ({
      ...status,
      refetch: (fetchOptions?: ResourceFetchOptions) =>
        mesh.fetchResource<TParams, TData>(resourceName, params, { ...options, ...fetchOptions, force: true }),
      prefetch: (fetchOptions?: ResourceFetchOptions) =>
        mesh.prefetchResource<TParams, TData>(resourceName, params, { ...options, ...fetchOptions }),
      fetchNextPage: (fetchOptions?: ResourceFetchOptions) =>
        mesh.fetchNextResourcePage<TParams, TData>(resourceName, params, { ...options, ...fetchOptions }),
      invalidate: (invalidation?: ResourceInvalidation) =>
        mesh.invalidateResources(normalizeHookInvalidation(resourceName, invalidation)),
      setData: (updater: TData | ((current: TData | null) => TData), setOptions?: ResourceSetDataOptions) =>
        mesh.setResourceData<TData, TParams>(resourceName, params, updater, setOptions)
    }),
    [mesh, resourceName, paramsKey, status]
  );
}

function normalizeHookInvalidation(resourceName: string, invalidation?: ResourceInvalidation): ResourceInvalidation {
  if (!invalidation) return { names: [resourceName] };
  if (Array.isArray(invalidation)) return { names: [resourceName], tags: invalidation };
  const scoped = invalidation as Exclude<ResourceInvalidation, readonly unknown[]>;
  return { ...scoped, names: scoped.names ?? [resourceName] };
}

function resourceStatusEqual(a: ResourceStatus, b: ResourceStatus): boolean {
  return (
    a.name === b.name &&
    a.key === b.key &&
    a.status === b.status &&
    a.pending === b.pending &&
    a.fetching === b.fetching &&
    a.stale === b.stale &&
    a.data === b.data &&
    a.error === b.error &&
    a.updatedAt === b.updatedAt &&
    a.startedAt === b.startedAt &&
    a.finishedAt === b.finishedAt &&
    a.duration === b.duration &&
    a.hasNextPage === b.hasNextPage &&
    arrayEqual(a.tags, b.tags) &&
    arrayEqual(a.pages, b.pages) &&
    arrayEqual(a.pageParams, b.pageParams)
  );
}

function arrayEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => Object.is(value, b[index]));
}

function stableHookHash(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(sortHookKey(value));
}

function sortHookKey(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortHookKey);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().reduce<Record<string, unknown>>((sorted, key) => {
    sorted[key] = sortHookKey(record[key]);
    return sorted;
  }, {});
}
