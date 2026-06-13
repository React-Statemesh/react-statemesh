import type { ReactNode } from "react";
import type { Mesh } from "../core/types";
import { StateMeshContext } from "./context";

/** Props for `StateMeshProvider`. */
export type StateMeshProviderProps<TState> = {
  /** Mesh instance created with `createMesh`. */
  mesh: Mesh<TState>;
  /** React subtree that can use StateMesh hooks. */
  children: ReactNode;
};

/**
 * Provides a StateMesh instance to React hooks.
 *
 * The provider stores only the mesh instance in context. State updates happen in the external store,
 * so the provider itself does not rerender for every state change.
 *
 * @example
 * ```tsx
 * <StateMeshProvider mesh={mesh}>
 *   <App />
 * </StateMeshProvider>
 * ```
 */
export function StateMeshProvider<TState>({ mesh, children }: StateMeshProviderProps<TState>) {
  return <StateMeshContext.Provider value={mesh as Mesh<unknown>}>{children}</StateMeshContext.Provider>;
}
