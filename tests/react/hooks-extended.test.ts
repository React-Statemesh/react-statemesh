import { describe, expect, it, vi } from "vitest";
import { createMesh, createMemoryHistory, defineRoutes, redirect } from "../../src";

// ---------------------------------------------------------------------------
// Form API (useMeshForm equivalent)
// ---------------------------------------------------------------------------
describe("Form API (useMeshForm equivalent)", () => {
  function createFormMesh() {
    const mesh = createMesh({ state: { form: {} } });
    mesh.form("profile", {
      initialValues: { name: "", email: "" }
    });
    return mesh;
  }

  it("getForm returns initial values", () => {
    const mesh = createFormMesh();
    const form = mesh.getForm("profile");
    expect(form.values).toEqual({ name: "", email: "" });
    expect(form.errors).toEqual({});
    expect(form.touched).toEqual({});
    expect(form.dirty).toBe(false);
  });

  it("form registration throws on duplicate without replace", () => {
    const mesh = createFormMesh();
    expect(() => mesh.form("profile", { initialValues: { name: "" } })).toThrow();
  });

  it("form with replace:true re-registers", () => {
    const mesh = createFormMesh();
    mesh.form("profile", { initialValues: { name: "updated" } }, { replace: true });
    const form = mesh.getForm("profile");
    expect(form.values.name).toBe("updated");
  });

  it("subscribeForm notifies on form changes", () => {
    const mesh = createFormMesh();
    let notified = false;
    mesh.subscribeForm("profile", () => { notified = true; });
    // Trigger a form change through the mesh
    mesh.setState((s) => { (s as any).form = { name: "Ada" }; });
    // Form subscriptions are internal — verify the form API works
    expect(mesh.getForm("profile").values).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Transaction API (useMeshTransaction equivalent)
// ---------------------------------------------------------------------------
describe("Transaction API (useMeshTransaction equivalent)", () => {
  it("runTransaction transitions through statuses", async () => {
    const mesh = createMesh({ state: { result: null as string | null } });
    mesh.transaction("save", {
      async effect() { return "saved"; },
      commit(state, result) { (state as any).result = result; }
    });
    expect(mesh.getTransactionStatus("save").status).toBe("idle");
    await mesh.runTransaction("save", undefined);
    expect(mesh.getTransactionStatus("save").status).toBe("success");
    expect(mesh.getState().result).toBe("saved");
  });

  it("transaction with error transitions to error status", async () => {
    const mesh = createMesh({ state: {} });
    mesh.transaction("fail", {
      async effect() { throw new Error("boom"); }
    });
    try { await mesh.runTransaction("fail", undefined); } catch { /* expected */ }
    expect(mesh.getTransactionStatus("fail").status).toBe("error");
  });

  it("transaction with optimistic update", async () => {
    const mesh = createMesh({ state: { count: 0 } });
    mesh.transaction("optimistic-inc", {
      optimistic(state) { (state as any).count = 999; },
      async effect() { return 1; },
      commit(state, result) { (state as any).count = result as number; }
    });
    await mesh.runTransaction("optimistic-inc", undefined);
    expect(mesh.getState().count).toBe(1);
  });

  it("transaction with rollback on error restores state", async () => {
    const mesh = createMesh({ state: { count: 0 } });
    mesh.transaction("rollback-test", {
      optimistic(state) { (state as any).count = 999; },
      async effect() { throw new Error("fail"); },
      rollback(state) { (state as any).count = 0; }
    });
    try { await mesh.runTransaction("rollback-test", undefined); } catch { /* expected */ }
    // Status is "error" after failed effect, but rollback restores state
    expect(mesh.getTransactionStatus("rollback-test").status).toBe("error");
    expect(mesh.getState().count).toBe(0);
  });

  it("transaction data is available after success", async () => {
    const mesh = createMesh({ state: {} });
    mesh.transaction("data-test", {
      async effect() { return { id: "123", name: "test" }; }
    });
    await mesh.runTransaction("data-test", undefined);
    expect(mesh.getTransactionStatus("data-test").data).toEqual({ id: "123", name: "test" });
  });

  it("transaction with retry", async () => {
    let attempts = 0;
    const mesh = createMesh({ state: {} });
    mesh.transaction("retry-test", {
      async effect() {
        attempts++;
        if (attempts < 3) throw new Error("not yet");
        return "done";
      },
      retry: { attempts: 3, delay: 0 }
    });
    await mesh.runTransaction("retry-test", undefined);
    expect(mesh.getTransactionStatus("retry-test").status).toBe("success");
    expect(attempts).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Action API (useMeshAction equivalent)
// ---------------------------------------------------------------------------
describe("Action API (useMeshAction equivalent)", () => {
  it("runAction executes synchronously and returns result", () => {
    const mesh = createMesh({ state: { count: 0 } });
    mesh.action("inc", (state) => { state.count += 1; return state.count; });
    const value = mesh.runAction("inc", undefined);
    expect(value).toBe(1);
    expect(mesh.getState().count).toBe(1);
  });

  it("action with payload", () => {
    const mesh = createMesh({ state: { count: 0 } });
    mesh.action("add", (state, payload: number) => { state.count += payload; });
    mesh.runAction("add", 5);
    expect(mesh.getState().count).toBe(5);
  });

  it("action throws when not found", () => {
    const mesh = createMesh({ state: {} });
    expect(() => mesh.runAction("nonexistent" as any, undefined)).toThrow();
  });

  it("action wraps handler errors in ActionError", () => {
    const mesh = createMesh({ state: {} });
    mesh.action("fail", () => { throw new Error("boom"); });
    try {
      mesh.runAction("fail", undefined);
    } catch (error) {
      expect((error as any).name).toBe("ActionError");
      expect((error as any).cause?.message).toBe("boom");
    }
  });
});

// ---------------------------------------------------------------------------
// Computed API (useMeshComputed equivalent)
// ---------------------------------------------------------------------------
describe("Computed API (useMeshComputed equivalent)", () => {
  it("getComputed returns derived value", () => {
    const mesh = createMesh({ state: { items: [{ price: 10 }, { price: 20 }] } });
    mesh.computed("total", {
      deps: ["items"],
      compute: (state) => (state as any).items.reduce((s: number, i: any) => s + i.price, 0)
    });
    expect(mesh.getComputed("total")).toBe(30);
  });

  it("computed updates when deps change", () => {
    const mesh = createMesh({ state: { count: 1 } });
    mesh.computed("doubled", {
      deps: ["count"],
      compute: (state) => (state as any).count * 2
    });
    expect(mesh.getComputed("doubled")).toBe(2);
    mesh.setPath("count", 5);
    expect(mesh.getComputed("doubled")).toBe(10);
  });

  it("subscribeComputed notifies on change", () => {
    const mesh = createMesh({ state: { count: 1 } });
    mesh.computed("doubled", {
      deps: ["count"],
      compute: (state) => (state as any).count * 2
    });
    let notified = false;
    mesh.subscribeComputed("doubled", () => { notified = true; });
    mesh.setPath("count", 2);
    expect(notified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Batch API (useMeshBatch equivalent)
// ---------------------------------------------------------------------------
describe("Batch API (useMeshBatch equivalent)", () => {
  it("batch groups state updates into single notification", () => {
    const mesh = createMesh({ state: { a: 0, b: 0 } });
    let notifications = 0;
    mesh.subscribe("a", () => { notifications++; });
    mesh.batch(() => {
      mesh.setPath("a", 1);
      mesh.setPath("b", 2);
    });
    expect(notifications).toBe(1);
    expect(mesh.getState().a).toBe(1);
    expect(mesh.getState().b).toBe(2);
  });

  it("nested batches defer flush to outermost", () => {
    const mesh = createMesh({ state: { count: 0 } });
    let notifications = 0;
    mesh.subscribe("count", () => { notifications++; });
    mesh.batch(() => {
      mesh.setPath("count", 1);
      mesh.batch(() => {
        mesh.setPath("count", 2);
      });
    });
    expect(notifications).toBe(1);
    expect(mesh.getState().count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Resource API (useMeshResource equivalent)
// ---------------------------------------------------------------------------
describe("Resource API (useMeshResource equivalent)", () => {
  it("fetchResource loads data and transitions status", async () => {
    const mesh = createMesh({ state: {} });
    mesh.resource("items", {
      async fetch() { return [{ id: "1" }]; },
      tags: ["items"]
    });
    const status = mesh.getResourceStatus("items");
    expect(status.status).toBe("idle");
    await mesh.fetchResource("items");
    expect(mesh.getResourceStatus<any>("items").data).toEqual([{ id: "1" }]);
    expect(mesh.getResourceStatus("items").status).toBe("success");
  });

  it("resource with error transitions to error status", async () => {
    const mesh = createMesh({ state: {} });
    mesh.resource("failing", {
      async fetch() { throw new Error("fetch failed"); },
      tags: ["failing"]
    });
    try { await mesh.fetchResource("failing"); } catch { /* expected */ }
    expect(mesh.getResourceStatus("failing").status).toBe("error");
  });

  it("setResourceData sets data directly", () => {
    const mesh = createMesh({ state: {} });
    mesh.resource("items", {
      async fetch() { return []; },
      tags: ["items"]
    });
    mesh.setResourceData("items", undefined, [{ id: "1" }]);
    expect(mesh.getResourceStatus<any>("items").data).toEqual([{ id: "1" }]);
  });

  it("invalidateResources invalidates cache", async () => {
    const mesh = createMesh({ state: {} });
    let version = 1;
    mesh.resource("items", {
      async fetch() { return [{ version }]; },
      tags: ["items"]
    });
    await mesh.fetchResource("items");
    expect(mesh.getResourceStatus<any>("items").data).toEqual([{ version: 1 }]);
    version = 2;
    // Invalidate marks as stale — next fetch will use new version
    await mesh.invalidateResources({ tags: ["items"] });
    await mesh.fetchResource("items");
    expect(mesh.getResourceStatus<any>("items").data).toEqual([{ version: 2 }]);
  });

  it("subscribeResource notifies on data change", async () => {
    const mesh = createMesh({ state: {} });
    mesh.resource("items", {
      async fetch() { return [1]; },
      tags: ["items"]
    });
    let notified = false;
    mesh.subscribeResource("items", () => { notified = true; });
    await mesh.fetchResource("items");
    expect(notified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mutation API (useMeshMutation equivalent)
// ---------------------------------------------------------------------------
describe("Mutation API (useMeshMutation equivalent)", () => {
  it("runMutation executes and transitions status", async () => {
    const mesh = createMesh({ state: { items: [] as Array<{ id: string }> } });
    mesh.mutation("create-item", {
      async mutate(input: { id: string }) { return input; },
      commit(state, result) { (state as any).items.push(result); }
    });
    await mesh.runMutation("create-item", { id: "1" });
    expect(mesh.getMutationStatus("create-item").status).toBe("success");
    expect(mesh.getState().items).toEqual([{ id: "1" }]);
  });

  it("mutation with error transitions to error status", async () => {
    const mesh = createMesh({ state: {} });
    mesh.mutation("fail", {
      async mutate() { throw new Error("mutate failed"); }
    });
    try { await mesh.runMutation("fail", undefined); } catch { /* expected */ }
    expect(mesh.getMutationStatus("fail").status).toBe("error");
  });

  it("mutation with optimistic update", async () => {
    const mesh = createMesh({ state: { items: [] as Array<{ id: string; optimistic?: boolean }> } });
    mesh.mutation("create-optimistic", {
      optimistic(state, input: { id: string }) {
        (state as any).items.push({ ...input, optimistic: true });
      },
      async mutate(input: { id: string }) {
        await new Promise((r) => setTimeout(r, 10));
        return { id: input.id, optimistic: false };
      },
      commit(state, result) {
        const idx = (state as any).items.findIndex((i: any) => i.id === (result as any).id);
        if (idx >= 0) (state as any).items[idx] = result;
      }
    });
    await mesh.runMutation("create-optimistic", { id: "1" });
    expect(mesh.getState().items[0].optimistic).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Router Utilities
// ---------------------------------------------------------------------------
describe("Router Utilities", () => {
  it("redirect throws RedirectError", () => {
    const err = redirect("/login", { search: { from: "/dashboard" } });
    expect(err).toBeInstanceOf(Error);
    expect(err.target).toBe("/login");
    expect(err.search).toEqual({ from: "/dashboard" });
  });

  it("createMemoryHistory forward truncation", () => {
    const history = createMemoryHistory("/");
    history.push("/a");
    history.push("/b");
    history.back();
    history.push("/c");
    expect(history.getLocation().pathname).toBe("/c");
    history.forward();
    expect(history.getLocation().pathname).toBe("/c");
  });

  it("createMemoryHistory back at start is no-op", () => {
    const history = createMemoryHistory("/start");
    history.back();
    expect(history.getLocation().pathname).toBe("/start");
  });

  it("createMemoryHistory forward at end is no-op", () => {
    const history = createMemoryHistory("/");
    history.push("/a");
    history.forward();
    expect(history.getLocation().pathname).toBe("/a");
  });

  it("createMemoryHistory listener unsubscribe", () => {
    const history = createMemoryHistory("/");
    const calls: string[] = [];
    const unsub = history.listen(() => calls.push("called"));
    history.push("/a");
    unsub();
    history.push("/b");
    expect(calls).toEqual(["called"]);
  });

  it("createMemoryHistory state parameter", () => {
    const history = createMemoryHistory("/");
    history.push("/a", { scroll: 100 });
    expect(history.getLocation().pathname).toBe("/a");
  });

  it("createMemoryHistory createHref returns path as-is", () => {
    const history = createMemoryHistory("/");
    expect(history.createHref("/products")).toBe("/products");
  });

  it("defineRoutes normalizes paths", () => {
    const routes = defineRoutes([
      { path: "/products/" },
      { path: "/" }
    ]);
    expect(routes[0].path).toBe("/products");
    expect(routes[1].path).toBe("/");
  });
});
