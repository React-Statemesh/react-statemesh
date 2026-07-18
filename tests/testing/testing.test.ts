import { describe, expect, it, vi } from "vitest";
import { createTestMesh } from "../../src/testing";
import { assertTransactionStatus, assertStatePath } from "../../src/testing/assertions";
import { waitForTransactionStatus, waitForMutationStatus } from "../../src/testing/waitFor";
import { createMesh, StateMeshError } from "../../src";

// ---------------------------------------------------------------------------
// createTestMesh
// ---------------------------------------------------------------------------
describe("createTestMesh", () => {
  it("returns a mesh with all 6 helper methods", () => {
    const mesh = createTestMesh({ state: { count: 0 } });
    expect(mesh.mockAction).toBeTypeOf("function");
    expect(mesh.mockTransactionEffect).toBeTypeOf("function");
    expect(mesh.mockResource).toBeTypeOf("function");
    expect(mesh.mockMutation).toBeTypeOf("function");
    expect(mesh.assertTransactionStatus).toBeTypeOf("function");
    expect(mesh.assertStatePath).toBeTypeOf("function");
  });

  it("mockAction replaces action handler with replace:true", () => {
    const mesh = createTestMesh({ state: { count: 0 } });
    mesh.mockAction("inc", (state) => { state.count += 1; });
    mesh.mockAction("inc", (state) => { state.count += 10; });
    mesh.runAction("inc", undefined);
    expect(mesh.getState().count).toBe(10);
  });

  it("mockTransactionEffect replaces effect while preserving commit", async () => {
    const mesh = createTestMesh({ state: { status: "idle" as string, result: null as string | null } });
    mesh.transaction("save", {
      async effect() { return "original"; },
      commit(state, result) { state.result = result as string; }
    });
    mesh.mockTransactionEffect("save", async () => "mocked-result");
    await mesh.runTransaction("save", undefined);
    mesh.assertTransactionStatus("save", "success");
    expect(mesh.getState().result).toBe("mocked-result");
  });

  it("mockTransactionEffect throws for unregistered transaction", async () => {
    const mesh = createTestMesh({ state: {} });
    expect(() => mesh.mockTransactionEffect("nonexistent", async () => {})).toThrow(StateMeshError);
    expect(() => mesh.mockTransactionEffect("nonexistent", async () => {})).toThrow(/Cannot mock unregistered transaction/);
  });

  it("mockResource sets data on a resource", () => {
    const mesh = createTestMesh<{ items: Array<{ id: string }> }>({ state: { items: [] } });
    mesh.resource("items.list", {
      async fetch() { return []; },
      tags: ["items"]
    });
    mesh.mockResource("items.list", { data: [{ id: "1" }] });
    const status = mesh.getResourceStatus("items.list");
    expect(status.data).toEqual([{ id: "1" }]);
  });

  it("assertTransactionStatus and assertStatePath are bound to the mesh", async () => {
    const mesh = createTestMesh({ state: { count: 42 } });
    mesh.transaction("noop", { async effect() {} });
    await mesh.runTransaction("noop", undefined);
    // These should not throw (bound methods)
    expect(() => mesh.assertTransactionStatus("noop", "success")).not.toThrow();
    expect(() => mesh.assertStatePath("count", 42)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertTransactionStatus (standalone)
// ---------------------------------------------------------------------------
describe("assertTransactionStatus (standalone)", () => {
  it("does not throw when status matches", async () => {
    const mesh = createMesh({ state: {} });
    mesh.transaction("noop", { async effect() {} });
    await mesh.runTransaction("noop", undefined);
    expect(() => assertTransactionStatus(mesh, "noop", "success")).not.toThrow();
  });

  it("throws StateMeshError when status mismatches", async () => {
    const mesh = createMesh({ state: {} });
    mesh.transaction("noop", { async effect() {} });
    await mesh.runTransaction("noop", undefined);
    expect(() => assertTransactionStatus(mesh, "noop", "error")).toThrow(StateMeshError);
  });

  it("includes transaction name, expected, actual in metadata", async () => {
    const mesh = createMesh({ state: {} });
    mesh.transaction("noop", { async effect() {} });
    await mesh.runTransaction("noop", undefined);
    try {
      assertTransactionStatus(mesh, "noop", "pending");
    } catch (error) {
      const smError = error as StateMeshError;
      expect(smError.code).toBe("STATEMESH_TEST_ASSERTION_FAILED");
      expect(smError.metadata?.transaction).toBe("noop");
      expect(smError.metadata?.expected).toBe("pending");
      expect(smError.metadata?.actual).toBe("success");
    }
  });

  it("works with idle status", () => {
    const mesh = createMesh({ state: {} });
    mesh.transaction("noop", { async effect() {} });
    expect(() => assertTransactionStatus(mesh, "noop", "idle")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertStatePath (standalone)
// ---------------------------------------------------------------------------
describe("assertStatePath (standalone)", () => {
  it("does not throw when value matches", () => {
    const mesh = createMesh({ state: { count: 42 } });
    expect(() => assertStatePath(mesh, "count", 42)).not.toThrow();
  });

  it("throws StateMeshError when value mismatches", () => {
    const mesh = createMesh({ state: { count: 42 } });
    expect(() => assertStatePath(mesh, "count", 99)).toThrow(StateMeshError);
  });

  it("includes path, expected, actual in metadata", () => {
    const mesh = createMesh({ state: { count: 42 } });
    try {
      assertStatePath(mesh, "count", 99);
    } catch (error) {
      const smError = error as StateMeshError;
      expect(smError.code).toBe("STATEMESH_TEST_ASSERTION_FAILED");
      expect(smError.metadata?.path).toBe("count");
      expect(smError.metadata?.expected).toBe(99);
      expect(smError.metadata?.actual).toBe(42);
    }
  });

  it("missing path has actual value of undefined", () => {
    const mesh = createMesh({ state: { count: 1 } });
    try {
      assertStatePath(mesh, "nonexistent", "something");
    } catch (error) {
      const smError = error as StateMeshError;
      expect(smError.metadata?.actual).toBeUndefined();
    }
  });

  it("works with deep paths", () => {
    const mesh = createMesh({ state: { cart: { items: [{ name: "Keyboard" }] } } });
    expect(() => assertStatePath(mesh, "cart.items.0.name", "Keyboard")).not.toThrow();
  });

  it("NaN matches NaN via Object.is", () => {
    const mesh = createMesh({ state: { value: NaN } });
    expect(() => assertStatePath(mesh, "value", NaN)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// waitForTransactionStatus
// ---------------------------------------------------------------------------
describe("waitForTransactionStatus", () => {
  it("resolves immediately if already at expected status", async () => {
    const mesh = createMesh({ state: {} });
    mesh.transaction("noop", { async effect() {} });
    mesh.runTransaction("noop", undefined);
    await expect(waitForTransactionStatus(mesh, "noop", "success")).resolves.toBeUndefined();
  });

  it("resolves when transaction reaches expected status", async () => {
    const mesh = createMesh({ state: {} });
    mesh.transaction("slow", {
      async effect() {
        await new Promise((r) => setTimeout(r, 50));
        return "done";
      }
    });
    const promise = waitForTransactionStatus(mesh, "slow", "success", { timeout: 2000, interval: 10 });
    mesh.runTransaction("slow", undefined);
    await expect(promise).resolves.toBeUndefined();
  });

  it("throws on timeout", async () => {
    const mesh = createMesh({ state: {} });
    mesh.transaction("stuck", { async effect() { await new Promise(() => {}); } });
    mesh.runTransaction("stuck", undefined);
    await expect(waitForTransactionStatus(mesh, "stuck", "success", { timeout: 100, interval: 10 })).rejects.toThrow(StateMeshError);
  });

  it("timeout metadata includes transaction name and timeout", async () => {
    const mesh = createMesh({ state: {} });
    mesh.transaction("stuck2", { async effect() { await new Promise(() => {}); } });
    mesh.runTransaction("stuck2", undefined);
    try {
      await waitForTransactionStatus(mesh, "stuck2", "success", { timeout: 100, interval: 10 });
    } catch (error) {
      const smError = error as StateMeshError;
      expect(smError.code).toBe("STATEMESH_TEST_TIMEOUT");
      expect(smError.metadata?.transaction).toBe("stuck2");
      expect(smError.metadata?.timeout).toBe(100);
    }
  });
});

// ---------------------------------------------------------------------------
// waitForMutationStatus
// ---------------------------------------------------------------------------
describe("waitForMutationStatus", () => {
  it("resolves immediately if already at expected status", async () => {
    const mesh = createMesh({ state: {} });
    mesh.mutation("create", { async mutate() { return "ok"; } });
    await mesh.runMutation("create", undefined);
    await expect(waitForMutationStatus(mesh, "create", "success")).resolves.toBeUndefined();
  });

  it("resolves when mutation reaches expected status", async () => {
    const mesh = createMesh({ state: {} });
    mesh.mutation("slow-create", {
      async mutate() {
        await new Promise((r) => setTimeout(r, 50));
        return "ok";
      }
    });
    const promise = waitForMutationStatus(mesh, "slow-create", "success", { timeout: 2000, interval: 10 });
    mesh.runMutation("slow-create", undefined);
    await expect(promise).resolves.toBeUndefined();
  });

  it("throws on timeout with mutation metadata", async () => {
    const mesh = createMesh({ state: {} });
    mesh.mutation("stuck-mut", { async mutate() { await new Promise(() => {}); } });
    mesh.runMutation("stuck-mut", undefined);
    try {
      await waitForMutationStatus(mesh, "stuck-mut", "success", { timeout: 100, interval: 10 });
    } catch (error) {
      const smError = error as StateMeshError;
      expect(smError.code).toBe("STATEMESH_TEST_TIMEOUT");
      expect(smError.metadata?.mutation).toBe("stuck-mut");
    }
  });
});

// ---------------------------------------------------------------------------
// Original tests preserved
// ---------------------------------------------------------------------------
describe("testing utilities (original)", () => {
  it("mocks transaction effects and asserts state/status", async () => {
    const mesh = createTestMesh({
      state: {
        status: "idle" as "idle" | "done"
      }
    });

    mesh.transaction("save", {
      async effect() {
        return "ok";
      },
      commit(state) {
        state.status = "done";
      }
    });

    mesh.mockTransactionEffect("save", async () => "mocked");
    await mesh.runTransaction("save", undefined);

    mesh.assertTransactionStatus("save", "success");
    mesh.assertStatePath("status", "done");
  });

  it("replaces mocked actions without duplicate registration errors", () => {
    const mesh = createTestMesh({
      state: {
        count: 0
      }
    });

    mesh.mockAction("count.set", (state, value: number) => {
      state.count = value;
    });
    mesh.mockAction("count.set", (state) => {
      state.count = 10;
    });

    mesh.runAction("count.set", 1);
    expect(mesh.getState().count).toBe(10);
  });
});
