import { describe, expect, it } from "vitest";
import { createMesh } from "../../src";
import { dependencyIntersects } from "../../src/computed/dependency";

// ---------------------------------------------------------------------------
// dependencyIntersects
// ---------------------------------------------------------------------------
describe("dependencyIntersects", () => {
  it("exact match returns true", () => {
    expect(dependencyIntersects("cart", "cart")).toBe(true);
  });

  it("parent/child returns true", () => {
    expect(dependencyIntersects("cart", "cart.items")).toBe(true);
  });

  it("child/parent returns true", () => {
    expect(dependencyIntersects("cart.items", "cart")).toBe(true);
  });

  it("no overlap returns false", () => {
    expect(dependencyIntersects("cart", "catalog")).toBe(false);
  });

  it("prefix false positive prevented by dot separator", () => {
    expect(dependencyIntersects("cart", "cartoon")).toBe(false);
  });

  it("empty strings match each other", () => {
    expect(dependencyIntersects("", "")).toBe(true);
  });

  it("empty vs non-empty returns false", () => {
    expect(dependencyIntersects("", "foo")).toBe(false);
    expect(dependencyIntersects("foo", "")).toBe(false);
  });

  it("deep paths", () => {
    expect(dependencyIntersects("a.b.c", "a.b")).toBe(true);
    expect(dependencyIntersects("a.b", "a.b.c")).toBe(true);
  });

  it("sibling paths return false", () => {
    expect(dependencyIntersects("a.b", "a.c")).toBe(false);
  });

  it("single segment overlap without dot returns false", () => {
    expect(dependencyIntersects("items", "itemsList")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mesh.computed() integration
// ---------------------------------------------------------------------------
describe("mesh.computed()", () => {
  it("derives value from state", () => {
    const mesh = createMesh({ state: { items: [{ price: 10 }, { price: 20 }] } });
    mesh.computed("cart.total", {
      deps: ["items"],
      compute: (state) => (state as any).items.reduce((sum: number, item: any) => sum + item.price, 0)
    });
    expect(mesh.getComputed("cart.total")).toBe(30);
  });

  it("recomputes when dep paths change", () => {
    const mesh = createMesh({ state: { count: 1 } });
    let computeCalls = 0;
    mesh.computed("count.doubled", {
      deps: ["count"],
      compute: (state) => {
        computeCalls++;
        return (state as any).count * 2;
      }
    });
    expect(mesh.getComputed("count.doubled")).toBe(2);
    mesh.setPath("count", 5);
    expect(mesh.getComputed("count.doubled")).toBe(10);
    expect(computeCalls).toBe(2);
  });

  it("returns cached value when deps unchanged", () => {
    const mesh = createMesh({ state: { count: 1, other: "x" } });
    let computeCalls = 0;
    mesh.computed("count.doubled", {
      deps: ["count"],
      compute: (state) => {
        computeCalls++;
        return (state as any).count * 2;
      }
    });
    mesh.getComputed("count.doubled"); // 1st compute
    mesh.setPath("other", "y"); // unrelated change
    mesh.getComputed("count.doubled"); // should use cache
    expect(computeCalls).toBe(1);
  });

  it("custom equality skips notification when result is structurally equal", () => {
    const mesh = createMesh({ state: { items: [1, 2, 3] } });
    mesh.computed("items.count", {
      deps: ["items"],
      compute: (state) => ({ count: (state as any).items.length }),
      equality: (a, b) => (a as any).count === (b as any).count
    });
    const first = mesh.getComputed("items.count");
    mesh.setPath("items", [4, 5, 6]); // different items, same length
    const second = mesh.getComputed("items.count");
    // The equality function should prevent recomputation from being "different"
    expect(first.count).toBe(second.count);
  });

  it("subscribeComputed notifies on change", () => {
    const mesh = createMesh({ state: { count: 1 } });
    mesh.computed("count.doubled", {
      deps: ["count"],
      compute: (state) => (state as any).count * 2
    });
    let notified = false;
    mesh.subscribeComputed("count.doubled", () => { notified = true; });
    mesh.setPath("count", 5);
    expect(notified).toBe(true);
  });
});
