import { describe, expect, it } from "vitest";
import { createTestMesh } from "../../src/testing";

describe("testing utilities", () => {
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
