import { useCallback, useSyncExternalStore } from "react";
import { useMeshComponentUsage } from "./componentTracking";
import { useMesh } from "./useMesh";

/**
 * Returns a stable `batch` callback that groups multiple state updates
 * into a single notification flush.
 *
 * @example
 * ```tsx
 * function CartUpdate() {
 *   const batch = useMeshBatch();
 *   return (
 *     <button onClick={() => batch(() => {
 *       mesh.setPath("cart.quantity", 3);
 *       mesh.setPath("cart.coupon", "SAVE10");
 *     })}>
 *       Update
 *     </button>
 *   );
 * }
 * ```
 */
export function useMeshBatch<TState = unknown>(): <T>(fn: () => T) => T {
  const mesh = useMesh<TState>();
  useMeshComponentUsage({ kind: "action", name: "batch" });

  // useSyncExternalStore to keep the reference stable across renders
  const subscribe = useCallback(() => () => {}, []);
  const getSnapshot = useCallback(() => mesh.batch, [mesh]);

  const batch = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return batch;
}
