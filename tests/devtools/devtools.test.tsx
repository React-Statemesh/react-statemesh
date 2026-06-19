import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StateMeshDevtools, createMesh } from "../../src";

describe("StateMesh DevTools", () => {
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
    expect(screen.getByText(/action\.counter\.increment/)).toBeTruthy();
    expect(screen.getByText(/\d+ms/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Doctor" }));
    expect(screen.getByText(/RESOURCE_WITHOUT_TAGS/)).toBeTruthy();
    expect(screen.getByText(/Resource "products.list" has no invalidation tags/)).toBeTruthy();
  });
});
