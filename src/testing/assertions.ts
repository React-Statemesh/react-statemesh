import { StateMeshError } from "../errors";
import { getPath } from "../utils";
import type { Mesh, TransactionStatusValue } from "../core/types";

/** Assert that a transaction currently has the expected status. */
export function assertTransactionStatus<TState>(
  mesh: Mesh<TState>,
  name: string,
  expected: TransactionStatusValue
): void {
  const actual = mesh.getTransactionStatus(name).status;
  if (actual !== expected) {
    throw new StateMeshError(`Expected transaction "${name}" to be "${expected}" but received "${actual}".`, {
      code: "STATEMESH_TEST_ASSERTION_FAILED",
      metadata: { transaction: name, expected, actual }
    });
  }
}

/** Assert that a state path equals an expected value using `Object.is`. */
export function assertStatePath<TState>(mesh: Mesh<TState>, path: string, expected: unknown): void {
  const actual = getPath(mesh.getState(), path);
  if (!Object.is(actual, expected)) {
    throw new StateMeshError(`Expected state path "${path}" to equal the expected value.`, {
      code: "STATEMESH_TEST_ASSERTION_FAILED",
      metadata: { path, expected, actual }
    });
  }
}
