import { useCallback, useSyncExternalStore } from "react";
import type { MeshPath } from "../core/types";
import type { EqualityFn } from "../utils";
import { useMesh } from "./useMesh";

/**
 * Subscribe to a derived value from mesh state.
 *
 * Uses `useSyncExternalStore` and an equality function to avoid rerendering when the selected value
 * has not changed.
 *
 * @example
 * ```tsx
 * const itemCount = useMeshSelector((state) =>
 *   state.cart.items.reduce((total, item) => total + item.quantity, 0)
 * );
 * ```
 */
export function useMeshSelector<TState = unknown, TSelected = unknown>(
  selector: ((state: TState) => TSelected) | MeshPath,
  equality: EqualityFn<TSelected> = Object.is
): TSelected {
  const mesh = useMesh<TState>();

  const subscribe = useCallback(
    (listener: () => void) =>
      mesh.subscribe(
        selector,
        () => listener(),
        { equality }
      ),
    [mesh, selector, equality]
  );

  const getSnapshot = useCallback(() => mesh.getSelectedSnapshot(selector), [mesh, selector]);
  const getServerSnapshot = useCallback(() => mesh.getSelectedServerSnapshot(selector), [mesh, selector]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
