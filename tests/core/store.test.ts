import { afterEach, describe, expect, it } from "vitest";
import { ActionError, ComputedError, DuplicateRegistrationError, GuardError, createMesh } from "../../src";

type AppState = {
  theme: "light" | "dark";
  user: { name: string } | null;
  cart: {
    items: Array<{ id: string; name: string; price: number; quantity: number }>;
    status: "idle" | "processing" | "completed" | "failed";
    error: string | null;
  };
  order: { id: string; total: number } | null;
};

function createAppMesh() {
  return createMesh<AppState>({
    name: "shopdesk",
    state: {
      theme: "light",
      user: null,
      cart: {
        items: [],
        status: "idle",
        error: null
      },
      order: null
    }
  });
}

afterEach(() => {
  document.querySelectorAll("script[src*='@vite/client']").forEach((script) => script.remove());
});

describe("createMesh core store", () => {
  it("reads, writes, resets, and restores snapshots", () => {
    const mesh = createAppMesh();
    const snap = mesh.snapshot("initial");

    mesh.setPath("theme", "dark");
    expect(mesh.getState().theme).toBe("dark");

    mesh.restore(snap.id);
    expect(mesh.getState().theme).toBe("light");

    mesh.setState((state) => {
      state.theme = "dark";
    });
    expect(mesh.getState().theme).toBe("dark");

    mesh.reset();
    expect(mesh.getState().theme).toBe("light");
  });

  it("notifies only subscriptions whose selected value changes", () => {
    const mesh = createAppMesh();
    let themeNotifications = 0;
    let cartNotifications = 0;

    mesh.subscribe("theme", () => {
      themeNotifications += 1;
    });
    mesh.subscribe("cart.items", () => {
      cartNotifications += 1;
    });

    mesh.setPath("user.name", "Ada");
    expect(themeNotifications).toBe(0);
    expect(cartNotifications).toBe(0);

    mesh.setPath("theme", "dark");
    expect(themeNotifications).toBe(1);
    expect(cartNotifications).toBe(0);
  });

  it("isolates asynchronous middleware and event listener failures", async () => {
    const mesh = createAppMesh();

    mesh.middleware(async () => {
      throw new Error("middleware failed");
    });
    mesh.onEvent(async () => {
      throw new Error("listener failed");
    });

    expect(() => mesh.setPath("theme", "dark")).not.toThrow();
    await Promise.resolve();
    expect(mesh.getState().theme).toBe("dark");
  });

  it("blocks guarded operations before they mutate state", async () => {
    const mesh = createAppMesh();
    mesh.action("cart.addItem", (state, product: { id: string; name: string; price: number }) => {
      state.cart.items.push({ ...product, quantity: 1 });
    });
    mesh.transaction("cart.checkout", {
      optimistic(state) {
        state.cart.status = "processing";
      },
      async effect() {
        return { id: "order_1", total: 100 };
      }
    });

    mesh.guard({ kind: "action", name: "cart.addItem" }, ({ state }) => ({
      allow: Boolean(state.user),
      reason: "Login required"
    }));
    mesh.guard(/^cart\./, ({ kind }) => kind === "transaction" ? false : true);

    expect(() => mesh.runAction("cart.addItem", { id: "keyboard", name: "Keyboard", price: 100 })).toThrow(GuardError);
    expect(mesh.getState().cart.items).toHaveLength(0);
    expect(() => mesh.runTransaction("cart.checkout", undefined)).toThrow(GuardError);
    expect(mesh.getState().cart.status).toBe("idle");

    mesh.setPath("user", { name: "Ada" });
    expect(() => mesh.runAction("cart.addItem", { id: "keyboard", name: "Keyboard", price: 100 })).not.toThrow();
    expect(mesh.getState().cart.items).toHaveLength(1);
  });

  it("dehydrates and hydrates mesh state", () => {
    const mesh = createAppMesh();
    mesh.setPath("theme", "dark");
    mesh.setPath("user", { name: "Ada" });

    const snapshot = mesh.dehydrate({ resources: false, urlStates: false, queuedMutations: false });
    const restored = createAppMesh();
    restored.hydrate(snapshot);

    expect(restored.getState().theme).toBe("dark");
    expect(restored.getState().user).toEqual({ name: "Ada" });
  });

  it("records bounded profiler samples and supports filtering", () => {
    const mesh = createMesh({
      name: "profiled",
      state: { count: 0 },
      profiler: {
        limit: 2,
        slowThreshold: 0
      }
    });
    let notifications = 0;
    mesh.subscribeProfiler(() => {
      notifications += 1;
    });
    const increment = mesh.action("counter.increment", (state) => {
      state.count += 1;
    });
    mesh.computed("counter.double", {
      deps: ["count"],
      compute: (state) => state.count * 2
    });

    increment(undefined);
    mesh.getComputed("counter.double");
    increment(undefined);

    const samples = mesh.getProfilerSamples();
    expect(samples).toHaveLength(2);
    expect(samples.every((sample) => sample.slow)).toBe(true);
    expect(mesh.getProfilerSamples({ kinds: ["computed"] })).toHaveLength(1);
    expect(notifications).toBeGreaterThanOrEqual(3);

    mesh.clearProfilerSamples();
    expect(mesh.getProfilerSamples()).toEqual([]);
  });

  it("reports production-readiness issues through StateMesh Doctor", () => {
    const mesh = createMesh({
      name: "doctor-test",
      state: {
        payload: "large enough"
      },
      profiler: {
        slowThreshold: 0
      }
    });
    mesh.resource("untagged.list", {
      async fetch() {
        return [];
      }
    });
    const run = mesh.action("doctor.slow", () => undefined);
    run(undefined);

    const report = mesh.doctor({
      stateSizeWarningBytes: 1,
      slowOperationWarningMs: 0
    });
    const codes = report.issues.map((issue) => issue.code);

    expect(report.mesh).toBe("doctor-test");
    expect(codes).toContain("STATE_SIZE_LARGE");
    expect(codes).toContain("RESOURCE_WITHOUT_TAGS");
    expect(codes).toContain("OPERATION_SLOW");
    expect(report.summary.warnings).toBeGreaterThanOrEqual(3);
  });
});

describe("actions and computed values", () => {
  it("runs named mutable actions and wraps action errors", () => {
    const mesh = createAppMesh();
    mesh.action("cart.addItem", (state, product: { id: string; name: string; price: number }) => {
      state.cart.items.push({ ...product, quantity: 1 });
    });

    mesh.runAction("cart.addItem", { id: "keyboard", name: "Keyboard", price: 100 });
    expect(mesh.getState().cart.items).toHaveLength(1);
    expect(mesh.getState().cart.items[0]?.quantity).toBe(1);

    mesh.action("cart.fail", () => {
      throw new Error("nope");
    });

    expect(() => mesh.runAction("cart.fail", undefined)).toThrow(ActionError);
  });

  it("guards duplicate registrations and supports explicit replacement", () => {
    const mesh = createAppMesh();
    const setTheme = mesh.action("theme.set", (state, theme: "light" | "dark") => {
      state.theme = theme;
    });

    expect(setTheme.actionName).toBe("theme.set");
    expect(setTheme.kind).toBe("statemesh.action");
    expect(() => mesh.action("theme.set", () => undefined)).toThrow(DuplicateRegistrationError);

    const forceDark = mesh.action("theme.set", (state) => {
      state.theme = "dark";
    }, { replace: true });
    forceDark(undefined);
    expect(mesh.getState().theme).toBe("dark");

    mesh.computed("cart.count", {
      deps: ["cart.items"],
      compute: (state) => state.cart.items.length
    });
    expect(() =>
      mesh.computed("cart.count", {
        compute: () => 0
      })
    ).toThrow(DuplicateRegistrationError);

    mesh.computed("cart.count", {
      compute: () => 10
    }, { replace: true });
    expect(mesh.getComputed("cart.count")).toBe(10);
  });

  it("replaces duplicate registrations during Vite browser HMR", () => {
    const script = document.createElement("script");
    script.src = "/@vite/client";
    document.head.appendChild(script);

    const mesh = createAppMesh();
    mesh.action("theme.set", (state) => {
      state.theme = "light";
    });

    const forceDark = mesh.action("theme.set", (state) => {
      state.theme = "dark";
    });

    forceDark(undefined);
    expect(mesh.getState().theme).toBe("dark");
  });

  it("caches computed values until a dependency changes", () => {
    const mesh = createAppMesh();
    let computeCount = 0;

    mesh.computed("cart.total", {
      deps: ["cart.items"],
      compute: (state) => {
        computeCount += 1;
        return state.cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      }
    });

    expect(mesh.getComputed("cart.total")).toBe(0);
    expect(mesh.getComputed("cart.total")).toBe(0);
    expect(computeCount).toBe(1);

    mesh.setPath("theme", "dark");
    expect(mesh.getComputed("cart.total")).toBe(0);
    expect(computeCount).toBe(1);

    mesh.setPath("cart.items", [{ id: "mouse", name: "Mouse", price: 40, quantity: 2 }]);
    expect(mesh.getComputed("cart.total")).toBe(80);
    expect(computeCount).toBe(2);
  });

  it("wraps computed failures", () => {
    const mesh = createAppMesh();
    mesh.computed("bad", {
      compute: () => {
        throw new Error("broken");
      }
    });

    expect(() => mesh.getComputed("bad")).toThrow(ComputedError);
  });
});
