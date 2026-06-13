import { PersistenceError } from "../errors";
import { isBrowser } from "../utils";
import type { PersistStorageName, StorageAdapter } from "../core/types";

const memoryStores = new Map<string, Map<string, string>>();

/**
 * Create an in-memory storage adapter for tests, SSR, or non-browser environments.
 *
 * Values are shared by namespace for the lifetime of the JavaScript process.
 *
 * @example
 * ```ts
 * const storage = createMemoryStorageAdapter("unit-tests");
 * mesh.persist({ storage, keys: ["theme"], version: 1 });
 * ```
 */
export function createMemoryStorageAdapter(namespace = "default"): StorageAdapter {
  let store = memoryStores.get(namespace);
  if (!store) {
    store = new Map();
    memoryStores.set(namespace, store);
  }

  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    }
  };
}

/**
 * Create a safe wrapper around `window.localStorage` or `window.sessionStorage`.
 *
 * The adapter is SSR-safe: reads return `null` and writes are ignored when `window` is unavailable.
 */
export function createWebStorageAdapter(kind: "localStorage" | "sessionStorage"): StorageAdapter {
  return {
    getItem(key) {
      if (!isBrowser()) return null;
      return window[kind].getItem(key);
    },
    setItem(key, value) {
      if (!isBrowser()) return;
      window[kind].setItem(key, value);
    },
    removeItem(key) {
      if (!isBrowser()) return;
      window[kind].removeItem(key);
    }
  };
}

/**
 * Create the v1 IndexedDB-shaped adapter.
 *
 * StateMesh v1 keeps this synchronous and memory-backed to preserve the storage adapter contract while
 * leaving room for a future async IndexedDB adapter.
 */
export function createIndexedDBStorageAdapter(namespace = "statemesh"): StorageAdapter {
  const fallback = createMemoryStorageAdapter(`indexedDB:${namespace}`);

  return {
    getItem: fallback.getItem,
    setItem: fallback.setItem,
    removeItem: fallback.removeItem
  };
}

/** Resolve a built-in storage name or custom adapter into a `StorageAdapter`. */
export function resolveStorageAdapter(storage: PersistStorageName | StorageAdapter): StorageAdapter {
  if (typeof storage !== "string") return storage;

  switch (storage) {
    case "localStorage":
      return createWebStorageAdapter("localStorage");
    case "sessionStorage":
      return createWebStorageAdapter("sessionStorage");
    case "memory":
      return createMemoryStorageAdapter();
    case "indexedDB":
      return createIndexedDBStorageAdapter();
    default:
      throw new PersistenceError(`Unsupported persistence storage "${storage}".`, {
        metadata: { storage }
      });
  }
}
