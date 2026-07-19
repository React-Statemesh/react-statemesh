import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { backoff } from "../../src/utils/backoff";
import { createBatcher } from "../../src/utils/batch";
import { cloneState } from "../../src/utils/clone";
import { debounce } from "../../src/utils/debounce";
import { shallowEqual } from "../../src/utils/equality";
import { invariant } from "../../src/utils/invariant";
import { parsePath, getPath, setPath, pickPaths, applyPathMap } from "../../src/utils/path";
import { createSelector } from "../../src/utils/selectors";
import { StateMeshError } from "../../src";

// ---------------------------------------------------------------------------
// backoff
// ---------------------------------------------------------------------------
describe("backoff", () => {
  it("returns default base delay for attempt 1", () => {
    const delay = backoff();
    expect(delay(1, new Error("test"))).toBe(1000);
  });

  it("exponentially increases delay with default factor 2", () => {
    const delay = backoff();
    expect(delay(2, new Error("test"))).toBe(2000);
    expect(delay(3, new Error("test"))).toBe(4000);
    expect(delay(4, new Error("test"))).toBe(8000);
  });

  it("caps delay at max", () => {
    const delay = backoff({ base: 1000, max: 5000 });
    expect(delay(10, new Error("test"))).toBe(5000);
  });

  it("respects custom base and factor", () => {
    const delay = backoff({ base: 500, factor: 3 });
    expect(delay(1, new Error("test"))).toBe(500);
    expect(delay(2, new Error("test"))).toBe(1500);
    expect(delay(3, new Error("test"))).toBe(4500);
  });

  it("returns un-jittered delay when jitter is false", () => {
    const delay = backoff({ base: 1000, jitter: false });
    expect(delay(1, new Error("test"))).toBe(1000);
  });

  it("returns jittered delay in [0, delay] range when jitter is true", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const delay = backoff({ base: 1000, jitter: true });
    // delay * (1 - 0.5 * 1) = 1000 * 0.5 = 500
    expect(delay(1, new Error("test"))).toBe(500);
    vi.restoreAllMocks();
  });

  it("applies fractional jitter when jitter is a number", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const delay = backoff({ base: 1000, jitter: 0.5 });
    // delay * (1 - 1 * 0.5) = 1000 * 0.5 = 500
    expect(delay(1, new Error("test"))).toBe(500);
    vi.restoreAllMocks();
  });

  it("clamps jittered result to 0 when fraction > 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const delay = backoff({ base: 1000, jitter: 2 });
    // delay * (1 - 1 * 2) = 1000 * -1 = -1000 → Math.max(0, -1000) = 0
    expect(delay(1, new Error("test"))).toBe(0);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// createBatcher
// ---------------------------------------------------------------------------
describe("createBatcher", () => {
  it("calls flush immediately when schedule() is called outside a batch", () => {
    const flush = vi.fn();
    const { schedule } = createBatcher(flush);
    schedule();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("defers flush when schedule() is called inside a batch", () => {
    const flush = vi.fn();
    const { batch, schedule } = createBatcher(flush);
    batch(() => {
      schedule();
      expect(flush).not.toHaveBeenCalled();
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("returns the value of fn from batch()", () => {
    const { batch } = createBatcher(() => {});
    const result = batch(() => 42);
    expect(result).toBe(42);
  });

  it("flushes only once for multiple schedule() calls inside a batch", () => {
    const flush = vi.fn();
    const { batch, schedule } = createBatcher(flush);
    batch(() => {
      schedule();
      schedule();
      schedule();
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("defers flush until outermost batch completes with nested batches", () => {
    const flush = vi.fn();
    const { batch, schedule } = createBatcher(flush);
    batch(() => {
      batch(() => {
        schedule();
        expect(flush).not.toHaveBeenCalled();
      });
      expect(flush).not.toHaveBeenCalled();
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does not flush if no schedule() was called during batch (not dirty)", () => {
    const flush = vi.fn();
    const { batch } = createBatcher(flush);
    batch(() => {});
    expect(flush).not.toHaveBeenCalled();
  });

  it("still flushes when fn throws inside batch (finally block)", () => {
    const flush = vi.fn();
    const { batch, schedule } = createBatcher(flush);
    expect(() => {
      batch(() => {
        schedule();
        throw new Error("boom");
      });
    }).toThrow("boom");
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("decrements depth correctly after exception (allows subsequent batch)", () => {
    const flush = vi.fn();
    const { batch, schedule } = createBatcher(flush);
    try {
      batch(() => {
        schedule();
        throw new Error("boom");
      });
    } catch {
      // ignore
    }
    // Depth should be back to 0, so a new schedule() should flush immediately
    schedule();
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("handles re-entrant flush calling batch()", () => {
    let flushCalls = 0;
    const { batch, schedule } = createBatcher(() => {
      flushCalls++;
      if (flushCalls === 1) {
        // flush triggers a new batch — should not cause infinite recursion
        batch(() => {
          schedule();
        });
      }
    });
    batch(() => {
      schedule();
    });
    expect(flushCalls).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// cloneState
// ---------------------------------------------------------------------------
describe("cloneState", () => {
  it("clones primitives", () => {
    expect(cloneState(42)).toBe(42);
    expect(cloneState("hello")).toBe("hello");
    expect(cloneState(true)).toBe(true);
    expect(cloneState(null)).toBe(null);
  });

  it("deep clones plain objects", () => {
    const original = { a: { b: { c: 1 } } };
    const cloned = cloneState(original);
    expect(cloned).toEqual(original);
    cloned.a.b.c = 2;
    expect(original.a.b.c).toBe(1);
  });

  it("deep clones arrays", () => {
    const original = [{ id: 1 }, { id: 2 }];
    const cloned = cloneState(original);
    expect(cloned).toEqual(original);
    cloned[0]!.id = 99;
    expect(original[0]!.id).toBe(1);
  });

  it("clones Date objects with structuredClone", () => {
    const date = new Date("2024-01-01");
    const cloned = cloneState(date);
    expect(cloned).toEqual(date);
    expect(cloned).not.toBe(date);
  });

  it("handles nested arrays and objects", () => {
    const original = { items: [{ tags: ["a", "b"] }] };
    const cloned = cloneState(original);
    cloned.items[0]!.tags.push("c");
    expect(original.items[0]!.tags).toEqual(["a", "b"]);
  });

  it("clones empty object and empty array", () => {
    expect(cloneState({})).toEqual({});
    expect(cloneState([])).toEqual([]);
  });

  it("handles Map with structuredClone", () => {
    const map = new Map([["key", "value"]]);
    const cloned = cloneState(map);
    expect(cloned.get("key")).toBe("value");
    expect(cloned).not.toBe(map);
  });

  it("handles Set with structuredClone", () => {
    const set = new Set([1, 2, 3]);
    const cloned = cloneState(set);
    expect(cloned.size).toBe(3);
    expect(cloned).not.toBe(set);
  });
});

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------
describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls fn after wait ms", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses last call's arguments on rapid calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced("a");
    debounced("b");
    debounced("c");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });

  it("cancel() prevents pending execution", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancel() is safe when nothing is pending", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    expect(() => debounced.cancel()).not.toThrow();
  });

  it("defers to next macrotask even with wait=0", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 0);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets debounce timer on subsequent calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes multiple arguments through", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced("a", 1, true);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith("a", 1, true);
  });

  it("returns void from the debounced function", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    const result = debounced();
    expect(result).toBeUndefined();
  });

  it("allows re-invocation after fire", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced("first");
    vi.advanceTimersByTime(100);
    debounced("second");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("second");
  });
});

// ---------------------------------------------------------------------------
// shallowEqual
// ---------------------------------------------------------------------------
describe("shallowEqual", () => {
  it("returns true for same reference", () => {
    const obj = { a: 1 };
    expect(shallowEqual(obj, obj)).toBe(true);
  });

  it("handles primitive Object.is semantics", () => {
    expect(shallowEqual(NaN, NaN)).toBe(true);
    expect(shallowEqual(+0, -0)).toBe(false);
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual("a", "a")).toBe(true);
  });

  it("returns true for structurally equal objects", () => {
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it("returns false for different keys", () => {
    expect(shallowEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it("returns false for same keys but different values", () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("compares nested objects by reference (not deep)", () => {
    const inner = { x: 1 };
    expect(shallowEqual({ a: inner }, { a: inner })).toBe(true);
    expect(shallowEqual({ a: { x: 1 } }, { a: { x: 1 } })).toBe(false);
  });

  it("compares arrays by indices", () => {
    expect(shallowEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(shallowEqual([1, 2], [1, 3])).toBe(false);
  });

  it("includes symbol keys in comparison", () => {
    const sym = Symbol("test");
    expect(shallowEqual({ [sym]: 1, a: 1 }, { [sym]: 1, a: 1 })).toBe(true);
    expect(shallowEqual({ [sym]: 1, a: 1 }, { [sym]: 2, a: 1 })).toBe(false);
  });

  it("does not compare inherited properties", () => {
    const proto = { inherited: 1 };
    const a = Object.create(proto);
    a.own = 2;
    const b = { own: 2 };
    expect(shallowEqual(a, b)).toBe(true);
  });

  it("returns false for null vs object", () => {
    expect(shallowEqual(null, { a: 1 })).toBe(false);
    expect(shallowEqual({ a: 1 }, null)).toBe(false);
  });

  it("returns false for different key counts", () => {
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it("returns true for empty objects", () => {
    expect(shallowEqual({}, {})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// invariant
// ---------------------------------------------------------------------------
describe("invariant", () => {
  it("does not throw for truthy conditions", () => {
    expect(() => invariant(true, "should not throw")).not.toThrow();
    expect(() => invariant(1, "should not throw")).not.toThrow();
    expect(() => invariant("yes", "should not throw")).not.toThrow();
    expect(() => invariant({}, "should not throw")).not.toThrow();
  });

  it("throws StateMeshError for false", () => {
    expect(() => invariant(false, "fail")).toThrow(StateMeshError);
    expect(() => invariant(false, "fail")).toThrow("fail");
  });

  it("throws for all falsy values", () => {
    expect(() => invariant(0, "zero")).toThrow("zero");
    expect(() => invariant("", "empty")).toThrow("empty");
    expect(() => invariant(null, "null")).toThrow("null");
    expect(() => invariant(undefined, "undef")).toThrow("undef");
    expect(() => invariant(NaN, "nan")).toThrow("nan");
  });

  it("uses default code STATEMESH_INVARIANT", () => {
    try {
      invariant(false, "test");
    } catch (error) {
      expect((error as StateMeshError).code).toBe("STATEMESH_INVARIANT");
    }
  });

  it("accepts custom error code", () => {
    try {
      invariant(false, "test", "CUSTOM_CODE");
    } catch (error) {
      expect((error as StateMeshError).code).toBe("CUSTOM_CODE");
    }
  });

  it("narrows type with asserts", () => {
    const value: string | null = "hello";
    invariant(value !== null, "value must not be null");
    // After invariant, TypeScript knows value is string
    expect(value.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// parsePath
// ---------------------------------------------------------------------------
describe("parsePath", () => {
  it("parses dot notation into segments", () => {
    expect(parsePath("cart.items.0")).toEqual(["cart", "items", 0]);
  });

  it("returns shallow copy for array input", () => {
    const input = ["a", "b", 1];
    const result = parsePath(input);
    expect(result).toEqual(["a", "b", 1]);
    expect(result).not.toBe(input);
  });

  it("returns empty array for empty string", () => {
    expect(parsePath("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parsePath("   ")).toEqual([]);
  });

  it("converts numeric-looking segments to numbers", () => {
    expect(parsePath("items.0.name")).toEqual(["items", 0, "name"]);
    expect(parsePath("arr.10")).toEqual(["arr", 10]);
  });

  it("keeps negative numbers as numbers", () => {
    expect(parsePath("arr.-1")).toEqual(["arr", -1]);
  });

  it("keeps non-integer numeric strings as strings", () => {
    expect(parsePath("arr.1x5")).toEqual(["arr", "1x5"]);
  });

  it("preserves leading empty segments from double dots", () => {
    expect(parsePath("a..b")).toEqual(["a", "", "b"]);
  });

  it("caches parsed paths for repeated lookups", () => {
    const first = parsePath("cached.path.0");
    const second = parsePath("cached.path.0");
    expect(first).toBe(second); // same reference from cache
  });

  it("handles numeric-only path segments", () => {
    expect(parsePath("0.1.2")).toEqual([0, 1, 2]);
  });
});

// ---------------------------------------------------------------------------
// getPath
// ---------------------------------------------------------------------------
describe("getPath", () => {
  it("reads a simple nested value", () => {
    expect(getPath({ a: { b: 1 } }, "a.b")).toBe(1);
  });

  it("returns undefined for missing path", () => {
    expect(getPath({ a: 1 }, "b.c")).toBeUndefined();
  });

  it("returns undefined when null encountered mid-traversal", () => {
    expect(getPath({ a: null }, "a.b")).toBeUndefined();
  });

  it("returns source itself for empty path", () => {
    const obj = { a: 1 };
    expect(getPath(obj, "")).toBe(obj);
  });

  it("reads array elements by index", () => {
    expect(getPath({ items: [10, 20, 30] }, "items.1")).toBe(20);
  });

  it("handles deep nesting", () => {
    const obj = { a: { b: { c: { d: { e: "deep" } } } } };
    expect(getPath(obj, "a.b.c.d.e")).toBe("deep");
  });

  it("returns undefined for null source", () => {
    expect(getPath(null, "anything")).toBeUndefined();
  });

  it("returns undefined for undefined source", () => {
    expect(getPath(undefined, "anything")).toBeUndefined();
  });

  it("reads properties on primitives via wrapper", () => {
    expect(getPath(42, "toString")).toBeTypeOf("function");
  });

  it("handles array as source with string path", () => {
    expect(getPath([10, 20, 30], "1")).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// setPath
// ---------------------------------------------------------------------------
describe("setPath", () => {
  it("updates a nested value immutably", () => {
    const original = { a: { b: 1 }, c: 2 };
    const result = setPath(original, "a.b", 99);
    expect(result.a.b).toBe(99);
    expect(result.c).toBe(2);
    expect(original.a.b).toBe(1); // original unchanged
  });

  it("preserves structural sharing for untouched branches", () => {
    const original = { a: { b: 1 }, c: { d: 2 } };
    const result = setPath(original, "a.b", 99);
    expect(result.c).toBe(original.c); // same reference
  });

  it("replaces entire state for empty path", () => {
    const original = { a: 1 };
    const result = setPath(original, "", "replaced");
    expect(result).toBe("replaced");
  });

  it("creates missing intermediate objects", () => {
    const original = {};
    const result = setPath(original, "a.b.c", 1);
    expect(getPath(result, "a.b.c")).toBe(1);
  });

  it("creates array for numeric intermediate segments", () => {
    const original = {};
    const result = setPath(original, "items.0.name", "first");
    expect(Array.isArray((result as any).items)).toBe(true);
    expect(getPath(result, "items.0.name")).toBe("first");
  });

  it("updates array elements", () => {
    const original = { items: [{ name: "a" }, { name: "b" }] };
    const result = setPath(original, "items.0.name", "updated");
    expect(getPath(result, "items.0.name")).toBe("updated");
    expect(original.items[0]!.name).toBe("a");
  });

  it("clones array intermediates with spread", () => {
    const original = { arr: [1, 2, 3] };
    const result = setPath(original, "arr.0", 99);
    expect((result as any).arr).not.toBe(original.arr);
    expect((result as any).arr[0]).toBe(99);
  });

  it("handles root replacement with a different type", () => {
    const result = setPath({ a: 1 }, "", [1, 2, 3]);
    expect(result).toEqual([1, 2, 3]);
  });

  it("handles primitive source with non-empty path", () => {
    const result = setPath(42 as any, "a.b", 1);
    expect(getPath(result, "a.b")).toBe(1);
  });

  it("sets a value at root-level path", () => {
    const result = setPath({ a: 1, b: 2 }, "a", 99);
    expect(result.a).toBe(99);
    expect(result.b).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// pickPaths
// ---------------------------------------------------------------------------
describe("pickPaths", () => {
  it("extracts multiple paths into a flat record", () => {
    const obj = { a: 1, b: { c: 2 }, d: 3 };
    expect(pickPaths(obj, ["a", "b.c"])).toEqual({ a: 1, "b.c": 2 });
  });

  it("sets undefined for missing paths", () => {
    const obj = { a: 1 };
    const result = pickPaths(obj, ["a", "missing"]);
    expect(result).toEqual({ a: 1, missing: undefined });
  });

  it("returns empty object for empty paths array", () => {
    expect(pickPaths({ a: 1 }, [])).toEqual({});
  });

  it("later duplicate path overwrites earlier", () => {
    const obj = { a: 1 };
    const result = pickPaths(obj, ["a", "a"]);
    expect(result).toEqual({ a: 1 });
  });

  it("extracts nested sub-trees", () => {
    const obj = { cart: { items: [{ id: 1 }] } };
    expect(pickPaths(obj, ["cart.items"])).toEqual({ "cart.items": [{ id: 1 }] });
  });
});

// ---------------------------------------------------------------------------
// applyPathMap
// ---------------------------------------------------------------------------
describe("applyPathMap", () => {
  it("applies multiple updates sequentially", () => {
    const state = { a: 1, b: 2, c: 3 };
    const result = applyPathMap(state, { a: 10, c: 30 });
    expect(result).toEqual({ a: 10, b: 2, c: 30 });
  });

  it("returns state unchanged for empty values", () => {
    const state = { a: 1 };
    const result = applyPathMap(state, {});
    expect(result).toBe(state);
  });

  it("applies overlapping paths in order", () => {
    const state = { a: { b: 1, c: 2 } };
    const result = applyPathMap(state, { "a.b": 10, "a.c": 20 });
    expect(getPath(result, "a.b")).toBe(10);
    expect(getPath(result, "a.c")).toBe(20);
  });

  it("returns new root reference", () => {
    const state = { a: 1 };
    const result = applyPathMap(state, { a: 2 });
    expect(result).not.toBe(state);
  });

  it("handles deep and shallow paths together", () => {
    const state = { x: 1, y: { z: 2 } };
    const result = applyPathMap(state, { x: 10, "y.z": 20 });
    expect(result.x).toBe(10);
    expect(getPath(result, "y.z")).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// createSelector
// ---------------------------------------------------------------------------
describe("createSelector", () => {
  it("computes on first call", () => {
    const selector = createSelector(
      [(state: unknown) => (state as { a: number }).a],
      (a) => a * 2
    );
    expect(selector({ a: 5 })).toBe(10);
  });

  it("returns cached result when deps unchanged", () => {
    let computeCalls = 0;
    const selector = createSelector(
      [(state: unknown) => (state as { a: number }).a],
      (a) => {
        computeCalls++;
        return a * 2;
      }
    );
    const state = { a: 5 };
    selector(state);
    selector(state);
    expect(computeCalls).toBe(1);
  });

  it("recomputes when a dep changes", () => {
    let computeCalls = 0;
    const selector = createSelector(
      [(state: unknown) => (state as { a: number }).a],
      (a) => {
        computeCalls++;
        return a * 2;
      }
    );
    selector({ a: 5 });
    selector({ a: 10 });
    expect(computeCalls).toBe(2);
  });

  it("uses custom equality function", () => {
    let computeCalls = 0;
    const selector = createSelector(
      [(state: unknown) => (state as { items: number[] }).items],
      (items) => {
        computeCalls++;
        return items.length;
      },
      (a, b) => (a as number[]).length === (b as number[]).length
    );
    selector({ items: [1, 2, 3] });
    selector({ items: [4, 5, 6] }); // different reference, same length
    expect(computeCalls).toBe(1);
  });

  it("computes once and never recomputes with empty deps", () => {
    let computeCalls = 0;
    const selector = createSelector(
      [],
      () => {
        computeCalls++;
        return "constant";
      }
    );
    expect(selector({ a: 1 })).toBe("constant");
    expect(selector({ a: 2 })).toBe("constant");
    expect(computeCalls).toBe(1);
  });

  it("handles multiple deps", () => {
    const selector = createSelector(
      [(state: unknown) => (state as { a: number; b: number }).a, (state: unknown) => (state as { b: number }).b],
      (a, b) => a + b
    );
    expect(selector({ a: 3, b: 7 })).toBe(10);
  });

  it("independent selectors have separate caches", () => {
    let callsA = 0;
    let callsB = 0;
    const selA = createSelector(
      [(state: unknown) => (state as { a: number }).a],
      (a) => {
        callsA++;
        return a;
      }
    );
    const selB = createSelector(
      [(state: unknown) => (state as { a: number }).a],
      (a) => {
        callsB++;
        return a * 2;
      }
    );
    selA({ a: 1 });
    selB({ a: 1 });
    expect(callsA).toBe(1);
    expect(callsB).toBe(1);
  });

  it("returns lastResult even if compute was never called (edge: undefined initial)", () => {
    const selector = createSelector(
      [(state: unknown) => (state as { a?: number }).a],
      (a) => a ?? "default"
    );
    expect(selector({})).toBe("default");
  });
});
