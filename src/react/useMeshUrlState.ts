import { useCallback, useSyncExternalStore } from "react";
import { useMesh } from "./useMesh";

/**
 * Read and update a registered URL query state entry.
 *
 * Use `mesh.urlState(name, defaults, options)` once during setup, then use this hook in components.
 *
 * @example
 * ```tsx
 * const [filters, setFilters] = useMeshUrlState("products.filters");
 * setFilters({ search: "keyboard", page: 1 });
 * ```
 */
export function useMeshUrlState<TValues extends Record<string, unknown> = Record<string, unknown>, TState = unknown>(
  name: string
): readonly [
  TValues,
  (valueOrUpdater: Partial<TValues> | ((current: TValues) => Partial<TValues> | TValues)) => void
] {
  const mesh = useMesh<TState>();
  const subscribe = useCallback((listener: () => void) => mesh.subscribeUrlState(name, listener), [mesh, name]);
  const getSnapshot = useCallback(() => mesh.getUrlState<TValues>(name), [mesh, name]);
  const values = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setValues = useCallback(
    (valueOrUpdater: Partial<TValues> | ((current: TValues) => Partial<TValues> | TValues)) => {
      mesh.setUrlState<TValues>(name, valueOrUpdater);
    },
    [mesh, name]
  );

  return [values, setValues] as const;
}
