import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { FormApi } from "../core/types";
import { useMesh } from "./useMesh";

/**
 * Subscribe to a registered StateMesh form.
 *
 * Use `mesh.form(name, definition)` once during setup, then call `useMeshForm(name)` in components.
 *
 * @example
 * ```tsx
 * const form = useMeshForm("profile.form");
 *
 * return (
 *   <form onSubmit={form.submit}>
 *     <input {...form.field("name")} />
 *   </form>
 * );
 * ```
 */
export function useMeshForm<TValues extends Record<string, unknown> = Record<string, unknown>, TState = unknown>(
  name: string
): FormApi<TValues> {
  const mesh = useMesh<TState>();
  const versionRef = useRef(0);

  const subscribe = useCallback(
    (listener: () => void) =>
      mesh.subscribeForm(name, () => {
        versionRef.current += 1;
        listener();
      }),
    [mesh, name]
  );

  const getSnapshot = useCallback(() => versionRef.current, []);
  const version = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(() => mesh.getForm<TValues>(name), [mesh, name, version]);
}
