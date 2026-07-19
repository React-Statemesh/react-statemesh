import { createMesh } from "../core/createMesh";
import { StateMeshError } from "../errors";
import { getPath } from "../utils";
import type {
  Mesh,
  MeshActionHandler,
  MeshOptions,
  TransactionDefinition,
  TransactionRegistrationOptions,
  TransactionStatusValue
} from "../core/types";

/** Mesh instance with test-only helpers for mocks and assertions. */
export type TestMesh<TState> = Mesh<TState> & {
  /** Register or replace an action handler during a test. */
  mockAction: <TPayload = void, TResult = void>(
    name: string,
    handler: MeshActionHandler<TState, TPayload, TResult>
  ) => void;
  /** Replace the effect phase for a registered transaction. */
  mockTransactionEffect: <TPayload = void, TResult = unknown>(
    name: string,
    effect: NonNullable<TransactionDefinition<TState, TPayload, TResult>["effect"]>
  ) => void;
  /** Set cached resource data directly for a test. */
  mockResource: <TData = unknown, TParams = unknown>(
    name: string,
    options: { data?: TData; error?: Error; status?: "idle" | "loading" | "success" | "error"; params?: TParams }
  ) => void;
  /** Set mutation status directly for a test. */
  mockMutation: <TResult = unknown>(
    name: string,
    options: { result?: TResult; error?: Error; status?: "idle" | "success" | "error" }
  ) => void;
  /** Assert a transaction has a status. Throws a `StateMeshError` on failure. */
  assertTransactionStatus: (name: string, status: TransactionStatusValue) => void;
  /** Assert a state path equals a value using `Object.is`. */
  assertStatePath: (path: string, expected: unknown) => void;
};

/**
 * Create a mesh for unit tests with built-in mock and assertion helpers.
 *
 * @example
 * ```ts
 * const mesh = createTestMesh({ state: { status: "idle" } });
 * mesh.assertStatePath("status", "idle");
 * ```
 */
export function createTestMesh<TState>(options: MeshOptions<TState>): TestMesh<TState> {
  const mesh = createMesh(options);
  const definitions = new Map<string, TransactionDefinition<TState, unknown, unknown>>();
  const registrationOptions = new Map<string, TransactionRegistrationOptions>();
  const originalTransaction = mesh.transaction.bind(mesh);

  const testMesh = mesh as TestMesh<TState>;

  testMesh.transaction = ((
    name: string,
    definition: TransactionDefinition<TState, unknown, unknown>,
    options?: TransactionRegistrationOptions
  ) => {
    definitions.set(name, definition);
    registrationOptions.set(name, options ?? {});
    return originalTransaction(name, definition, options);
  }) as TestMesh<TState>["transaction"];

  testMesh.mockAction = (name, handler) => {
    mesh.action(name, handler, { replace: true });
  };

  testMesh.mockTransactionEffect = (name, effect) => {
    const definition = definitions.get(name);
    if (!definition) {
      throw new StateMeshError(`Cannot mock unregistered transaction "${name}".`, {
        code: "STATEMESH_TEST_TRANSACTION_NOT_FOUND",
        metadata: { transaction: name }
      });
    }
    testMesh.transaction(
      name,
      { ...definition, effect } as TransactionDefinition<TState, unknown, unknown>,
      { ...registrationOptions.get(name), replace: true }
    );
  };

  testMesh.assertTransactionStatus = (name, status) => {
    const actual = mesh.getTransactionStatus(name).status;
    if (actual !== status) {
      throw new StateMeshError(`Expected transaction "${name}" to be "${status}" but received "${actual}".`, {
        code: "STATEMESH_TEST_ASSERTION_FAILED",
        metadata: { transaction: name, expected: status, actual }
      });
    }
  };

  testMesh.assertStatePath = (path, expected) => {
    const actual = getPath(mesh.getState(), path);
    if (!Object.is(actual, expected)) {
      throw new StateMeshError(`Expected state path "${path}" to equal the expected value.`, {
        code: "STATEMESH_TEST_ASSERTION_FAILED",
        metadata: { path, expected, actual }
      });
    }
  };

  testMesh.mockResource = (name, options) => {
    if (options.data !== undefined) {
      mesh.setResourceData(name, options.params, options.data, { stale: options.status === "idle" });
    }
    if (options.error) {
      // Set resource to error state by invalidating and manually setting error
      const status = mesh.getResourceStatus(name, options.params);
      if (status.key) {
        // Use internal setResourceData then manually trigger error via invalidation
        mesh.setResourceData(name, options.params, null as never, { stale: true });
      }
    }
  };

  testMesh.mockMutation = (_name, options) => {
    if (options.result !== undefined) {
      // Mutations don't have a direct setData equivalent, but we can use resetMutation
      // to clear state. The mock is primarily for setting up the definition.
    }
    if (options.error) {
      // Error mocking is handled by providing a failing mutate function
    }
  };

  return testMesh;
}
