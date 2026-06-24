import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateMeshDevtools, createMesh } from "../../src";

describe("StateMesh DevTools", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates masked snapshots for debug reports", () => {
    const mesh = createMesh({
      name: "snapshot-test",
      state: {
        auth: { token: "secret-token" },
        count: 1
      }
    });
    mesh.resource("profile.read", {
      async fetch() {
        return { name: "Ada", token: "server-token" };
      },
      tags: ["profile"]
    });
    mesh.setResourceData("profile.read", undefined, { name: "Ada", token: "server-token" });
    mesh.mutation("profile.save", {
      async mutate(payload: { token: string }) {
        return { ok: true, token: payload.token };
      }
    });
    mesh.form("profile.form", {
      initialValues: { name: "Ada", token: "form-token" }
    });

    const snapshot = mesh.getDevtoolsSnapshot({
      mask: ["auth.token", "token"]
    });

    expect((snapshot.state as { auth: { token: string } }).auth.token).toBe("[StateMesh masked]");
    expect((snapshot.resources[0]?.preview as { token: string }).token).toBe("[StateMesh masked]");
    expect((snapshot.forms[0]?.values as { token: string }).token).toBe("[StateMesh masked]");
    expect(snapshot.summary.resources).toBe(1);
    expect(snapshot.summary.forms).toBe(1);
    expect(snapshot.mutations[0]?.name).toBe("profile.save");
  });

  it("renders the dock tabs, component tree, and minimize launcher", () => {
    const mesh = createMesh({
      name: "dock-test",
      state: { products: [] }
    });
    mesh.resource("products.list", {
      async fetch() {
        return [{ id: "1", name: "Keyboard" }];
      },
      tags: ["products"]
    });
    mesh.setResourceData("products.list", undefined, [{ id: "1", name: "Keyboard" }]);
    const unregister = mesh.registerDevtoolsComponent({
      id: "products-screen",
      name: "ProductsScreen",
      parentId: null
    });
    mesh.recordDevtoolsComponentUsage("products-screen", {
      kind: "resource",
      name: "products.list"
    });

    render(<StateMeshDevtools mesh={mesh} />);

    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("React StateMesh DevTools active"),
      expect.any(String),
      expect.any(String),
      "dock-test"
    );
    expect(screen.getAllByText("React StateMesh DevTools active").length).toBeGreaterThan(0);
    expect(screen.getByText("State Keys")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resources" }));
    expect(screen.getByText("Resource Cache")).toBeTruthy();
    expect(screen.getByText("products.list")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Components" }));
    expect(screen.getByText("Component Tree")).toBeTruthy();
    expect(screen.getAllByText("ProductsScreen").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Min" }));
    fireEvent.click(screen.getByRole("button", { name: "Open StateMesh DevTools" }));
    expect(screen.getByLabelText("StateMesh DevTools")).toBeTruthy();

    unregister();
  });

  it("shows profiler samples and Doctor findings", async () => {
    const mesh = createMesh({
      name: "devtools-test",
      state: { count: 0 },
      profiler: {
        slowThreshold: 0
      }
    });
    const increment = mesh.action("counter.increment", (state) => {
      state.count += 1;
    });
    mesh.resource("products.list", {
      async fetch() {
        return [];
      }
    });

    render(<StateMeshDevtools mesh={mesh} showProfiler showDoctor />);

    await act(async () => {
      increment(undefined);
    });

    fireEvent.click(screen.getByRole("button", { name: "Profiler" }));

    await waitFor(() => {
      expect(screen.getByText(/action\.counter\.increment/)).toBeTruthy();
      expect(screen.getAllByText(/\d+ms/).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Doctor" }));
    expect(screen.getByText(/RESOURCE_WITHOUT_TAGS/)).toBeTruthy();
    expect(screen.getByText(/Resource "products.list" has no invalidation tags/)).toBeTruthy();
  });
});
