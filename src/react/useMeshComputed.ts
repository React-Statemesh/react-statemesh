import { useCallback, useSyncExternalStore } from "react";
import { useMeshComponentUsage } from "./componentTracking";
import { useMesh } from "./useMesh";

/**
 * Subscribe to a registered computed value.
 *
 * Computed values are cached and recomputed only when their dependency paths change.
 *
 * @example
 * ```tsx
 * const total = useMeshComputed("cart.total");
 * ```
 */
export function useMeshComputed<TValue = unknown, TState = unknown>(name: string): TValue {
  const mesh = useMesh<TState>();
  useMeshComponentUsage({ kind: "computed", name });
  const subscribe = useCallback((listener: () => void) => mesh.subscribeComputed(name, listener), [mesh, name]);
  const getSnapshot = useCallback(() => mesh.getComputed<TValue>(name), [mesh, name]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
