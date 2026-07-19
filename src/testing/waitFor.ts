import { StateMeshError } from "../errors";
import type { Mesh, TransactionStatusValue, MutationStatusValue } from "../core/types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a transaction to reach a specific status.
 *
 * @example
 * ```ts
 * await waitForTransactionStatus(mesh, "checkout.submit", "success", { timeout: 5000 });
 * ```
 */
export async function waitForTransactionStatus<TState>(
  mesh: Mesh<TState>,
  name: string,
  expected: TransactionStatusValue,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 10;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const status = mesh.getTransactionStatus(name);
    if (status.status === expected) return;
    await sleep(interval);
  }

  const actual = mesh.getTransactionStatus(name).status;
  throw new StateMeshError(
    `Timed out waiting for transaction "${name}" to reach status "${expected}". Current status: "${actual}".`,
    {
      code: "STATEMESH_TEST_TIMEOUT",
      metadata: { transaction: name, expected, actual, timeout }
    }
  );
}

/**
 * Wait for a mutation to reach a specific status.
 *
 * @example
 * ```ts
 * await waitForMutationStatus(mesh, "orders.create", "success", { timeout: 5000 });
 * ```
 */
export async function waitForMutationStatus<TState>(
  mesh: Mesh<TState>,
  name: string,
  expected: MutationStatusValue,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 10;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const status = mesh.getMutationStatus(name);
    if (status.status === expected) return;
    await sleep(interval);
  }

  const actual = mesh.getMutationStatus(name).status;
  throw new StateMeshError(
    `Timed out waiting for mutation "${name}" to reach status "${expected}". Current status: "${actual}".`,
    {
      code: "STATEMESH_TEST_TIMEOUT",
      metadata: { mutation: name, expected, actual, timeout }
    }
  );
}
