import { useContext } from "react";
import { ProviderError } from "../errors";
import type { Mesh } from "../core/types";
import { StateMeshContext } from "./context";

/**
 * Return the nearest StateMesh instance from context.
 *
 * Throws `ProviderError` when called outside `StateMeshProvider`.
 *
 * @example
 * ```tsx
 * const mesh = useMesh();
 * const state = mesh.getState();
 * ```
 */
export function useMesh<TState = unknown>(): Mesh<TState> {
  const mesh = useContext(StateMeshContext);
  if (!mesh) {
    throw new ProviderError("StateMesh hooks must be used inside a StateMeshProvider.");
  }
  return mesh as Mesh<TState>;
}
