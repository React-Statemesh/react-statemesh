import { describe, expect, it } from "vitest";
import { createMemoryStorageAdapter, createMesh } from "../../src";

type PersistState = {
  theme: "light" | "dark";
  cart: {
    items: Array<{ id: string; quantity: number }>;
  };
  auth: {
    token: string | null;
  };
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

describe("persistence", () => {
  it("persists whitelisted paths and restores them safely", () => {
    const storage = createMemoryStorageAdapter("persist-test");
    const first = createPersistMesh();

    first.persist({
      key: "app",
      storage,
      keys: ["theme", "cart.items"],
      version: 1
    });
    first.setPath("theme", "dark");
    first.setPath("cart.items", [{ id: "keyboard", quantity: 1 }]);
    first.setPath("auth.token", "secret");

    const second = createPersistMesh();
    second.persist({
      key: "app",
      storage,
      keys: ["theme", "cart.items"],
      version: 1
    });

    expect(second.getState().theme).toBe("dark");
    expect(second.getState().cart.items).toEqual([{ id: "keyboard", quantity: 1 }]);
    expect(second.getState().auth.token).toBeNull();
  });

  it("ignores corrupted storage without crashing", () => {
    const storage = createMemoryStorageAdapter("corrupt");
    storage.setItem("app", "{not json");
    const mesh = createPersistMesh();

    expect(() =>
      mesh.persist({
        key: "app",
        storage,
        keys: ["theme"],
        version: 1
      })
    ).not.toThrow();
    expect(mesh.getState().theme).toBe("light");
  });

  it("skips persistence writes when whitelisted paths do not change", () => {
    const writes: string[] = [];
    const storage = createMemoryStorageAdapter("persist-change-detection");
    const countingStorage = {
      getItem: storage.getItem,
      removeItem: storage.removeItem,
      setItem(key: string, value: string) {
        writes.push(value);
        storage.setItem(key, value);
      }
    };
    const mesh = createPersistMesh();

    mesh.persist({
      key: "app",
      storage: countingStorage,
      keys: ["theme"],
      version: 1
    });

    expect(writes).toHaveLength(1);
    mesh.setPath("auth.token", "secret");
    expect(writes).toHaveLength(1);

    mesh.setPath("theme", "dark");
    expect(writes).toHaveLength(2);
  });
});
