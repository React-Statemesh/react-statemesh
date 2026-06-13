import type { Mesh, MeshActionHandler } from "../core/types";

/** Register or replace an action handler for a test mesh. */
export function mockAction<TState, TPayload = void, TResult = void>(
  mesh: Mesh<TState>,
  name: string,
  handler: MeshActionHandler<TState, TPayload, TResult>
): void {
  mesh.action(name, handler);
}
