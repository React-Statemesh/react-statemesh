import { useCallback } from "react";
import type { MeshPath } from "../core/types";
import { useMesh } from "./useMesh";
import { useMeshSelector } from "./useMeshSelector";

/**
 * Read and update a single state path.
 *
 * Feels like `useState`, but the value is stored in the StateMesh external store and subscribed by path.
 *
 * @example
 * ```tsx
 * const [theme, setTheme] = useMeshState("theme");
 * setTheme(theme === "light" ? "dark" : "light");
 * ```
 */
export function useMeshState<TValue = unknown, TState = unknown>(
  path: MeshPath
): readonly [TValue, (valueOrUpdater: TValue | ((current: TValue) => TValue)) => void] {
  const mesh = useMesh<TState>();
  const value = useMeshSelector<TState, TValue>(path);

  const setValue = useCallback(
    (valueOrUpdater: TValue | ((current: TValue) => TValue)) => {
      mesh.setPath(path, valueOrUpdater as unknown);
    },
    [mesh, path]
  );

  return [value, setValue] as const;
}
