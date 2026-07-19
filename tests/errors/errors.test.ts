import { describe, expect, it, vi } from "vitest";
import {
  StateMeshError,
  ActionError,
  ApiClientError,
  ComputedError,
  DuplicateRegistrationError,
  FormError,
  GuardError,
  MutationError,
  PersistenceError,
  ProviderError,
  ResourceError,
  SelectorError,
  SyncError,
  TransactionError,
  TransactionRollbackError,
  UrlStateError,
  isStateMeshError,
  isApiClientError,
  getErrorMessage,
  getErrorStatus,
  getErrorMetadata
} from "../../src";

// ---------------------------------------------------------------------------
// StateMeshError base class
// ---------------------------------------------------------------------------
describe("StateMeshError", () => {
  it("stores message, code, and metadata", () => {
    const error = new StateMeshError("test error", {
      code: "TEST_CODE",
      metadata: { key: "value" }
    });
    expect(error.message).toBe("test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.metadata).toEqual({ key: "value" });
  });

  it("sets name to StateMeshError", () => {
    const error = new StateMeshError("msg", { code: "X" });
    expect(error.name).toBe("StateMeshError");
  });

  it("extends Error", () => {
    const error = new StateMeshError("msg", { code: "X" });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StateMeshError);
  });

  it("has a timestamp (Date.now at construction)", () => {
    const before = Date.now();
    const error = new StateMeshError("msg", { code: "X" });
    const after = Date.now();
    expect(error.timestamp).toBeGreaterThanOrEqual(before);
    expect(error.timestamp).toBeLessThanOrEqual(after);
  });

  it("sets cause via defineProperty (non-writable)", () => {
    const original = new Error("original");
    const error = new StateMeshError("wrapper", { code: "X", cause: original });
    expect((error as any).cause).toBe(original);
    const descriptor = Object.getOwnPropertyDescriptor(error, "cause");
    expect(descriptor?.writable).toBe(false);
  });

  it("has a stack trace", () => {
    const error = new StateMeshError("msg", { code: "X" });
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("StateMeshError");
  });

  it("supports undefined metadata", () => {
    const error = new StateMeshError("msg", { code: "X" });
    expect(error.metadata).toBeUndefined();
  });

  it("supports undefined cause", () => {
    const error = new StateMeshError("msg", { code: "X" });
    expect((error as any).cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// All 14 subclasses (standard pattern)
// ---------------------------------------------------------------------------
const subclassTests: Array<{
  name: string;
  Class: typeof StateMeshError;
  code: string;
}> = [
  { name: "ActionError", Class: ActionError, code: "STATEMESH_ACTION_ERROR" },
  { name: "ComputedError", Class: ComputedError, code: "STATEMESH_COMPUTED_ERROR" },
  { name: "DuplicateRegistrationError", Class: DuplicateRegistrationError, code: "STATEMESH_DUPLICATE_REGISTRATION" },
  { name: "FormError", Class: FormError, code: "STATEMESH_FORM_ERROR" },
  { name: "GuardError", Class: GuardError, code: "STATEMESH_GUARD_BLOCKED" },
  { name: "MutationError", Class: MutationError, code: "STATEMESH_MUTATION_ERROR" },
  { name: "PersistenceError", Class: PersistenceError, code: "STATEMESH_PERSISTENCE_ERROR" },
  { name: "ProviderError", Class: ProviderError, code: "STATEMESH_PROVIDER_ERROR" },
  { name: "ResourceError", Class: ResourceError, code: "STATEMESH_RESOURCE_ERROR" },
  { name: "SelectorError", Class: SelectorError, code: "STATEMESH_SELECTOR_ERROR" },
  { name: "SyncError", Class: SyncError, code: "STATEMESH_SYNC_ERROR" },
  { name: "TransactionError", Class: TransactionError, code: "STATEMESH_TRANSACTION_ERROR" },
  { name: "TransactionRollbackError", Class: TransactionRollbackError, code: "STATEMESH_TRANSACTION_ROLLBACK_ERROR" },
  { name: "UrlStateError", Class: UrlStateError, code: "STATEMESH_URL_STATE_ERROR" }
];

for (const { name, Class, code } of subclassTests) {
  describe(name, () => {
    it(`sets name to "${name}"`, () => {
      const error = new (Class as any)("msg");
      expect(error.name).toBe(name);
    });

    it(`has default code "${code}"`, () => {
      const error = new (Class as any)("msg");
      expect(error.code).toBe(code);
    });

    it("is instanceof StateMeshError and Error", () => {
      const error = new (Class as any)("msg");
      expect(error).toBeInstanceOf(StateMeshError);
      expect(error).toBeInstanceOf(Error);
    });

    it("allows custom code override", () => {
      const error = new Class("msg", { code: "CUSTOM" });
      expect(error.code).toBe("CUSTOM");
    });

    it("passes through custom metadata", () => {
      const error = new Class("msg", { metadata: { feature: "test" } } as any);
      expect(error.metadata).toEqual({ feature: "test" });
    });

    it("accepts optional options without throwing", () => {
      expect(() => new (Class as any)("msg")).not.toThrow();
    });
  });
}

// ---------------------------------------------------------------------------
// ApiClientError (special subclass)
// ---------------------------------------------------------------------------
describe("ApiClientError", () => {
  it("defaults status to 0", () => {
    const error = new ApiClientError("fail");
    expect(error.status).toBe(0);
  });

  it("sets status from options", () => {
    const error = new ApiClientError("fail", { status: 404 });
    expect(error.status).toBe(404);
  });

  it("defaults response to null", () => {
    const error = new ApiClientError("fail");
    expect(error.response).toBeNull();
  });

  it("sets response from options", () => {
    const mockResponse = new Response("body", { status: 500 });
    const error = new ApiClientError("fail", { response: mockResponse });
    expect(error.response).toBe(mockResponse);
  });

  it("sets name to ApiClientError", () => {
    const error = new ApiClientError("fail");
    expect(error.name).toBe("ApiClientError");
  });

  it("has default code STATEMESH_API_CLIENT_ERROR", () => {
    const error = new ApiClientError("fail");
    expect(error.code).toBe("STATEMESH_API_CLIENT_ERROR");
  });

  it("is instanceof both ApiClientError and StateMeshError", () => {
    const error = new ApiClientError("fail");
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toBeInstanceOf(StateMeshError);
    expect(error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------
describe("error helpers", () => {
  describe("isStateMeshError", () => {
    it("returns true for StateMeshError", () => {
      expect(isStateMeshError(new StateMeshError("x", { code: "X" }))).toBe(true);
    });

    it("returns true for subclasses", () => {
      expect(isStateMeshError(new ActionError("x"))).toBe(true);
      expect(isStateMeshError(new ApiClientError("x"))).toBe(true);
      expect(isStateMeshError(new SyncError("x"))).toBe(true);
    });

    it("returns false for plain Error", () => {
      expect(isStateMeshError(new Error("x"))).toBe(false);
    });

    it("returns false for non-error values", () => {
      expect(isStateMeshError("string")).toBe(false);
      expect(isStateMeshError(null)).toBe(false);
      expect(isStateMeshError(undefined)).toBe(false);
      expect(isStateMeshError(42)).toBe(false);
      expect(isStateMeshError({ message: "x" })).toBe(false);
    });
  });

  describe("isApiClientError", () => {
    it("returns true for ApiClientError", () => {
      expect(isApiClientError(new ApiClientError("x"))).toBe(true);
    });

    it("returns false for StateMeshError (not ApiClientError)", () => {
      expect(isApiClientError(new StateMeshError("x", { code: "X" }))).toBe(false);
    });

    it("returns false for other subclasses", () => {
      expect(isApiClientError(new ActionError("x"))).toBe(false);
    });

    it("returns false for plain Error", () => {
      expect(isApiClientError(new Error("x"))).toBe(false);
    });

    it("returns false for non-error values", () => {
      expect(isApiClientError(null)).toBe(false);
      expect(isApiClientError({ status: 404 })).toBe(false);
    });
  });

  describe("getErrorMessage", () => {
    it("extracts message from Error", () => {
      expect(getErrorMessage(new Error("fail"))).toBe("fail");
    });

    it("extracts message from StateMeshError", () => {
      expect(getErrorMessage(new StateMeshError("mesh fail", { code: "X" }))).toBe("mesh fail");
    });

    it("extracts message from string", () => {
      expect(getErrorMessage("plain string")).toBe("plain string");
    });

    it("returns fallback for empty message Error", () => {
      const error = new Error("");
      expect(getErrorMessage(error)).toBe("Something went wrong.");
    });

    it("returns fallback for empty string", () => {
      expect(getErrorMessage("")).toBe("Something went wrong.");
    });

    it("returns fallback for null/undefined", () => {
      expect(getErrorMessage(null)).toBe("Something went wrong.");
      expect(getErrorMessage(undefined)).toBe("Something went wrong.");
    });

    it("returns fallback for numbers and objects", () => {
      expect(getErrorMessage(42)).toBe("Something went wrong.");
      expect(getErrorMessage({})).toBe("Something went wrong.");
    });

    it("uses custom fallback", () => {
      expect(getErrorMessage(null, "Not found")).toBe("Not found");
    });
  });

  describe("getErrorStatus", () => {
    it("extracts status from ApiClientError", () => {
      expect(getErrorStatus(new ApiClientError("x", { status: 422 }))).toBe(422);
    });

    it("returns null for ApiClientError with status 0 (falsy)", () => {
      expect(getErrorStatus(new ApiClientError("x", { status: 0 }))).toBe(null);
    });

    it("returns null for ApiClientError with default status (0)", () => {
      expect(getErrorStatus(new ApiClientError("x"))).toBe(null);
    });

    it("extracts status from plain object with numeric status", () => {
      expect(getErrorStatus({ status: 500 })).toBe(500);
    });

    it("returns 0 for plain object with status 0 (no || null for plain objects)", () => {
      expect(getErrorStatus({ status: 0 })).toBe(0);
    });

    it("returns null for plain object with non-numeric status", () => {
      expect(getErrorStatus({ status: "not-a-number" })).toBe(null);
    });

    it("returns null for plain Error", () => {
      expect(getErrorStatus(new Error("x"))).toBe(null);
    });

    it("returns null for null/undefined", () => {
      expect(getErrorStatus(null)).toBe(null);
      expect(getErrorStatus(undefined)).toBe(null);
    });
  });

  describe("getErrorMetadata", () => {
    it("extracts metadata from StateMeshError", () => {
      const error = new StateMeshError("x", { code: "X", metadata: { feature: "auth" } });
      expect(getErrorMetadata(error)).toEqual({ feature: "auth" });
    });

    it("extracts metadata from subclasses", () => {
      const error = new ActionError("x", { metadata: { action: "test" } });
      expect(getErrorMetadata(error)).toEqual({ action: "test" });
    });

    it("returns null for StateMeshError without metadata", () => {
      const error = new StateMeshError("x", { code: "X" });
      expect(getErrorMetadata(error)).toBeNull();
    });

    it("returns null for empty metadata object", () => {
      const error = new StateMeshError("x", { code: "X", metadata: {} });
      expect(getErrorMetadata(error)).toEqual({});
    });

    it("returns null for plain Error", () => {
      expect(getErrorMetadata(new Error("x"))).toBeNull();
    });

    it("returns null for plain object with metadata field", () => {
      expect(getErrorMetadata({ metadata: { a: 1 } })).toBeNull();
    });

    it("returns null for primitive values", () => {
      expect(getErrorMetadata("string")).toBeNull();
      expect(getErrorMetadata(42)).toBeNull();
      expect(getErrorMetadata(null)).toBeNull();
    });
  });
});
