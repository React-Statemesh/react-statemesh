import type { TestMesh } from "./createTestMesh";
import type { TransactionDefinition } from "../core/types";

/** Replace the effect phase of a registered transaction for a test. */
export function mockTransactionEffect<TState, TPayload = void, TResult = unknown>(
  mesh: TestMesh<TState>,
  name: string,
  effect: NonNullable<TransactionDefinition<TState, TPayload, TResult>["effect"]>
): void {
  mesh.mockTransactionEffect(name, effect);
}
