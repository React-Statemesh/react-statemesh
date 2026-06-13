import { StateMeshError } from "../errors/StateMeshError";

/** Throw a `StateMeshError` when a condition is false. */
export function invariant(condition: unknown, message: string, code = "STATEMESH_INVARIANT"): asserts condition {
  if (!condition) {
    throw new StateMeshError(message, { code });
  }
}
