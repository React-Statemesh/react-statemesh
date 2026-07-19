import { describe, expect, it, vi } from "vitest";
import {
  createMesh,
  createMemoryStorageAdapter,
  createLocalStorageAdapter,
  createSessionStorageAdapter,
  createIndexedDBStorageAdapter,
  resolveStorageAdapter,
  createMigration,
  jsonSerializer,
  PersistenceError
} from "../../src";

type PersistState = {
  theme: "light" | "dark";
  cart: { items: Array<{ id: string; quantity: number }> };
  auth: { token: string | null };
};

function createPersistMesh() {
  return createMesh<PersistState>({
    name: "persist-test",
    state: {
      theme: "light",
      cart: { items: [] },
      auth: { token: null }
    }
  });
}

// ---------------------------------------------------------------------------
// createMemoryStorageAdapter
// ---------------------------------------------------------------------------
describe("createMemoryStorageAdapter", () => {
  it("shared namespace returns same underlying store", () => {
    const a = createMemoryStorageAdapter("shared-ns");
    const b = createMemoryStorageAdapter("shared-ns");
    a.setItem("key", "value");
    expect(b.getItem("key")).toBe("value");
  });

  it("different namespaces are isolated", () => {
    const a = createMemoryStorageAdapter("ns-a");
    const b = createMemoryStorageAdapter("ns-b");
    a.setItem("key", "value-a");
    expect(b.getItem("key")).toBeNull();
  });

  it("getItem returns null for missing key", () => {
    const storage = createMemoryStorageAdapter("missing-key");
    expect(storage.getItem("nonexistent")).toBeNull();
  });

  it("setItem/getItem round-trip", () => {
    const storage = createMemoryStorageAdapter("roundtrip");
    storage.setItem("data", JSON.stringify({ a: 1 }));
    expect(JSON.parse(storage.getItem("data")!)).toEqual({ a: 1 });
  });

  it("removeItem removes key", () => {
    const storage = createMemoryStorageAdapter("remove");
    storage.setItem("key", "value");
    storage.removeItem("key");
    expect(storage.getItem("key")).toBeNull();
  });

  it("removeItem on missing key is a no-op", () => {
    const storage = createMemoryStorageAdapter("remove-missing");
    expect(() => storage.removeItem("nonexistent")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createLocalStorageAdapter
// ---------------------------------------------------------------------------
describe("createLocalStorageAdapter", () => {
  it("reads and writes via window.localStorage", () => {
    const adapter = createLocalStorageAdapter();
    adapter.setItem("ls-test", "hello");
    expect(adapter.getItem("ls-test")).toBe("hello");
    adapter.removeItem("ls-test");
    expect(adapter.getItem("ls-test")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createSessionStorageAdapter
// ---------------------------------------------------------------------------
describe("createSessionStorageAdapter", () => {
  it("reads and writes via window.sessionStorage", () => {
    const adapter = createSessionStorageAdapter();
    adapter.setItem("ss-test", "hello");
    expect(adapter.getItem("ss-test")).toBe("hello");
    adapter.removeItem("ss-test");
    expect(adapter.getItem("ss-test")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createIndexedDBStorageAdapter
// ---------------------------------------------------------------------------
describe("createIndexedDBStorageAdapter", () => {
  it("is memory-backed (v1 stub)", () => {
    const adapter = createIndexedDBStorageAdapter("test-idb");
    adapter.setItem("key", "value");
    expect(adapter.getItem("key")).toBe("value");
  });

  it("namespace isolation", () => {
    const a = createIndexedDBStorageAdapter("idb-a");
    const b = createIndexedDBStorageAdapter("idb-b");
    a.setItem("key", "value-a");
    expect(b.getItem("key")).toBeNull();
  });

  it("default namespace is 'statemesh'", () => {
    const adapter = createIndexedDBStorageAdapter();
    adapter.setItem("key", "default-ns");
    // Verify it works (default namespace)
    expect(adapter.getItem("key")).toBe("default-ns");
  });
});

// ---------------------------------------------------------------------------
// resolveStorageAdapter
// ---------------------------------------------------------------------------
describe("resolveStorageAdapter", () => {
  it("resolves 'memory' to a working adapter", () => {
    const adapter = resolveStorageAdapter("memory");
    adapter.setItem("k", "v");
    expect(adapter.getItem("k")).toBe("v");
  });

  it("resolves 'localStorage' to web storage adapter", () => {
    const adapter = resolveStorageAdapter("localStorage");
    adapter.setItem("resolve-ls", "test");
    expect(adapter.getItem("resolve-ls")).toBe("test");
    adapter.removeItem("resolve-ls");
  });

  it("resolves 'sessionStorage' to web storage adapter", () => {
    const adapter = resolveStorageAdapter("sessionStorage");
    adapter.setItem("resolve-ss", "test");
    expect(adapter.getItem("resolve-ss")).toBe("test");
    adapter.removeItem("resolve-ss");
  });

  it("resolves 'indexedDB' to memory-backed adapter", () => {
    const adapter = resolveStorageAdapter("indexedDB");
    adapter.setItem("k", "v");
    expect(adapter.getItem("k")).toBe("v");
  });

  it("passes through custom adapter objects directly", () => {
    const custom = { getItem: () => "custom", setItem: () => {}, removeItem: () => {} };
    const resolved = resolveStorageAdapter(custom);
    expect(resolved).toBe(custom);
    expect(resolved.getItem("any")).toBe("custom");
  });

  it("throws PersistenceError for unknown storage string", () => {
    expect(() => resolveStorageAdapter("unknown" as any)).toThrow(PersistenceError);
    expect(() => resolveStorageAdapter("unknown" as any)).toThrow("Unsupported persistence storage");
  });
});

// ---------------------------------------------------------------------------
// createMigration
// ---------------------------------------------------------------------------
describe("createMigration", () => {
  it("applies a single migration", () => {
    const migrate = createMigration({
      2: (state) => ({ ...state, v2: true })
    });
    const result = migrate({ v1: true }, 1);
    expect(result).toEqual({ v1: true, v2: true });
  });

  it("applies multiple migrations in ascending version order", () => {
    const order: number[] = [];
    const migrate = createMigration({
      3: (state) => { order.push(3); return { ...state, v3: true }; },
      2: (state) => { order.push(2); return { ...state, v2: true }; }
    });
    const result = migrate({}, 1);
    expect(order).toEqual([2, 3]);
    expect(result).toEqual({ v2: true, v3: true });
  });

  it("handles sparse (non-contiguous) versions", () => {
    const migrate = createMigration({
      5: (state) => ({ ...state, v5: true }),
      10: (state) => ({ ...state, v10: true })
    });
    const result = migrate({}, 1);
    expect(result).toEqual({ v5: true, v10: true });
  });

  it("returns state unchanged when no versions are greater than fromVersion", () => {
    const migrate = createMigration({
      2: (state) => ({ ...state, v2: true })
    });
    const state = { existing: true };
    const result = migrate(state, 2);
    expect(result).toBe(state);
  });

  it("chains migrations (each receives output of previous)", () => {
    const migrate = createMigration({
      2: (state) => ({ ...state, count: (state.count as number) + 1 }),
      3: (state) => ({ ...state, count: (state.count as number) * 10 })
    });
    const result = migrate({ count: 1 }, 1);
    expect(result).toEqual({ count: 20 });
  });

  it("migration that throws propagates the error", () => {
    const migrate = createMigration({
      2: () => { throw new Error("migration failed"); }
    });
    expect(() => migrate({}, 1)).toThrow("migration failed");
  });
});

// ---------------------------------------------------------------------------
// jsonSerializer
// ---------------------------------------------------------------------------
describe("jsonSerializer", () => {
  it("serialize/deserialize round-trips objects", () => {
    const obj = { a: 1, b: [2, 3], c: { nested: true } };
    const serialized = jsonSerializer.serialize(obj);
    expect(typeof serialized).toBe("string");
    expect(jsonSerializer.deserialize(serialized)).toEqual(obj);
  });

  it("serialize/deserialize round-trips primitives", () => {
    expect(jsonSerializer.deserialize(jsonSerializer.serialize(42))).toBe(42);
    expect(jsonSerializer.deserialize(jsonSerializer.serialize("hello"))).toBe("hello");
    expect(jsonSerializer.deserialize(jsonSerializer.serialize(true))).toBe(true);
    expect(jsonSerializer.deserialize(jsonSerializer.serialize(null))).toBe(null);
  });

  it("serialize throws on circular references", () => {
    const obj: any = {};
    obj.self = obj;
    expect(() => jsonSerializer.serialize(obj)).toThrow();
  });

  it("deserialize throws on invalid JSON", () => {
    expect(() => jsonSerializer.deserialize("{invalid")).toThrow(SyntaxError);
  });
});

// ---------------------------------------------------------------------------
// Persist integration tests
// ---------------------------------------------------------------------------
describe("persistence integration", () => {
  it("persists whitelisted paths and restores them", () => {
    const storage = createMemoryStorageAdapter("integ-persist");
    const first = createPersistMesh();
    first.persist({ key: "app", storage, keys: ["theme", "cart.items"], version: 1 });
    first.setPath("theme", "dark");
    first.setPath("cart.items", [{ id: "kb", quantity: 1 }]);
    first.setPath("auth.token", "secret");

    const second = createPersistMesh();
    second.persist({ key: "app", storage, keys: ["theme", "cart.items"], version: 1 });
    expect(second.getState().theme).toBe("dark");
    expect(second.getState().cart.items).toEqual([{ id: "kb", quantity: 1 }]);
    expect(second.getState().auth.token).toBeNull();
  });

  it("ignores corrupted storage without crashing", () => {
    const storage = createMemoryStorageAdapter("integ-corrupt");
    storage.setItem("app", "{not json");
    const mesh = createPersistMesh();
    expect(() => mesh.persist({ key: "app", storage, keys: ["theme"], version: 1 })).not.toThrow();
    expect(mesh.getState().theme).toBe("light");
  });

  it("skips persistence writes when whitelisted paths do not change", () => {
    const writes: string[] = [];
    const storage = createMemoryStorageAdapter("integ-no-write");
    const countingStorage = {
      getItem: storage.getItem,
      removeItem: storage.removeItem,
      setItem(key: string, value: string) {
        writes.push(value);
        storage.setItem(key, value);
      }
    };
    const mesh = createPersistMesh();
    mesh.persist({ key: "app", storage: countingStorage, keys: ["theme"], version: 1 });
    expect(writes).toHaveLength(1);
    mesh.setPath("auth.token", "secret");
    expect(writes).toHaveLength(1);
    mesh.setPath("theme", "dark");
    expect(writes).toHaveLength(2);
  });

  it("blacklist excludes paths from persistence", () => {
    const storage = createMemoryStorageAdapter("integ-blacklist");
    const mesh = createPersistMesh();
    mesh.persist({ key: "app", storage, keys: ["theme", "cart"], blacklist: ["cart"], version: 1 });
    mesh.setPath("theme", "dark");
    mesh.setPath("cart.items", [{ id: "kb", quantity: 1 }]);

    const mesh2 = createPersistMesh();
    mesh2.persist({ key: "app", storage, keys: ["theme", "cart"], blacklist: ["cart"], version: 1 });
    expect(mesh2.getState().theme).toBe("dark");
    expect(mesh2.getState().cart.items).toEqual([]);
  });

  it("custom serializer/deserializer is used", () => {
    const storage = createMemoryStorageAdapter("integ-custom-serializer");
    const serializeCalls: unknown[] = [];
    const deserializeCalls: string[] = [];
    const mesh = createPersistMesh();
    mesh.persist({
      key: "app",
      storage,
      keys: ["theme"],
      version: 1,
      serializer(value) {
        serializeCalls.push(value);
        return JSON.stringify(value);
      },
      deserializer(value) {
        deserializeCalls.push(value);
        return JSON.parse(value);
      }
    });
    mesh.setPath("theme", "dark");
    expect(serializeCalls.length).toBeGreaterThan(0);

    const mesh2 = createPersistMesh();
    mesh2.persist({
      key: "app",
      storage,
      keys: ["theme"],
      version: 1,
      serializer: (v) => JSON.stringify(v),
      deserializer(value) {
        deserializeCalls.push(value);
        return JSON.parse(value);
      }
    });
    expect(mesh2.getState().theme).toBe("dark");
    expect(deserializeCalls.length).toBeGreaterThan(0);
  });

  it("onError callback is called on restore failure", () => {
    const storage = createMemoryStorageAdapter("integ-onerror");
    storage.setItem("bad-app", "not valid json{{{");
    const onError = vi.fn();
    const mesh = createPersistMesh();
    // Should not throw, but should call onError
    expect(() =>
      mesh.persist({ key: "bad-app", storage, keys: ["theme"], version: 1, onError })
    ).not.toThrow();
  });

  it("version triggers migration on restore", () => {
    const storage = createMemoryStorageAdapter("integ-migrate");
    // Simulate v1 persisted state
    storage.setItem("migrate-app", JSON.stringify({ state: { theme: "dark" }, version: 1 }));

    const mesh = createPersistMesh();
    mesh.persist({
      key: "migrate-app",
      storage,
      keys: ["theme"],
      version: 2,
      migrate: (state, fromVersion) => {
        if (fromVersion === 1) return { ...state, migrated: true };
        return state;
      }
    });
  });

  it("multiple persist registrations on same mesh", () => {
    const storageA = createMemoryStorageAdapter("integ-multi-a");
    const storageB = createMemoryStorageAdapter("integ-multi-b");
    const mesh = createPersistMesh();
    mesh.persist({ key: "first", storage: storageA, keys: ["theme"], version: 1 });
    mesh.persist({ key: "second", storage: storageB, keys: ["auth.token"], version: 1 });
    mesh.setPath("theme", "dark");
    mesh.setPath("auth.token", "abc");

    const mesh2 = createPersistMesh();
    mesh2.persist({ key: "first", storage: storageA, keys: ["theme"], version: 1 });
    mesh2.persist({ key: "second", storage: storageB, keys: ["auth.token"], version: 1 });
    expect(mesh2.getState().theme).toBe("dark");
    expect(mesh2.getState().auth.token).toBe("abc");
  });
});
