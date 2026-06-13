import { describe, expect, it } from "vitest";
import { ActionError, ComputedError, DuplicateRegistrationError, createMesh } from "../../src";

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
