import { describe, expect, it } from "vitest";
import { createApiClient, createMesh, MutationError } from "../../src";

type AppState = {
  todos: Array<{ id: string; title: string; optimistic?: boolean }>;
};

function createAppMesh() {
  return createMesh<AppState>({
    name: "resources-test",
    state: {
      todos: []
    }
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("resources", () => {
  it("dedupes concurrent requests and serves fresh cache", async () => {
    const mesh = createAppMesh();
    const first = deferred<Array<{ id: string }>>();
    let fetches = 0;

    mesh.resource("todos.list", {
      staleTime: "1m",
      async fetch() {
        fetches += 1;
        return first.promise;
      },
      tags: ["todos"]
    });

    const one = mesh.fetchResource("todos.list");
    const two = mesh.fetchResource("todos.list");
    first.resolve([{ id: "1" }]);

    await expect(one).resolves.toEqual([{ id: "1" }]);
    await expect(two).resolves.toEqual([{ id: "1" }]);
    expect(fetches).toBe(1);

    await expect(mesh.fetchResource("todos.list")).resolves.toEqual([{ id: "1" }]);
    expect(fetches).toBe(1);
  });

  it("invalidates tagged resources and refetches active subscribers", async () => {
    const mesh = createAppMesh();
    let version = 1;
    let notifications = 0;

    mesh.resource("todos.list", {
      async fetch() {
        return [{ id: String(version) }];
      },
      tags: ["todos"]
    });

    mesh.subscribeResource("todos.list", () => {
      notifications += 1;
    });

    await mesh.fetchResource("todos.list");
    version = 2;
    await mesh.invalidateResources({ tags: ["todos"], refetch: "active" });

    expect(mesh.getResourceStatus<Array<{ id: string }>>("todos.list").data).toEqual([{ id: "2" }]);
    expect(notifications).toBeGreaterThan(1);
  });

  it("rolls back optimistic mesh state and resource cache when a mutation fails", async () => {
    const mesh = createAppMesh();

    mesh.resource("todos.list", {
      initialData: [] as Array<{ id: string; title: string; optimistic?: boolean }>,
      async fetch() {
        return [];
      },
      tags: ["todos"]
    });

    mesh.mutation("todos.create", {
      optimistic(state, payload: { title: string }, context) {
        const optimisticTodo = { id: "temp", title: payload.title, optimistic: true };
        state.todos.push(optimisticTodo);
        context.setResourceData("todos.list", undefined, (current: Array<typeof optimisticTodo> | null) => [
          ...(current ?? []),
          optimisticTodo
        ]);
      },
      async mutate() {
        throw new Error("offline");
      }
    });

    await expect(mesh.runMutation("todos.create", { title: "Ship it" })).rejects.toThrow(MutationError);
    expect(mesh.getState().todos).toEqual([]);
    expect(mesh.getResourceStatus("todos.list").data).toEqual([]);
    expect(mesh.getMutationStatus("todos.create").status).toBe("error");
  });

  it("supports pagination with fetchNextResourcePage", async () => {
    const mesh = createAppMesh();

    mesh.resource("todos.pages", {
      async fetch(_params: void, context) {
        const page = Number(context.pageParam ?? 1);
        return { page, items: [`todo_${page}`] };
      },
      getNextPageParam(lastPage) {
        return lastPage.page < 2 ? lastPage.page + 1 : null;
      },
      mergePages(pages) {
        return {
          page: pages[pages.length - 1]?.page ?? 1,
          items: pages.flatMap((page) => page.items)
        };
      }
    });

    await mesh.fetchResource("todos.pages");
    expect(mesh.getResourceStatus<{ page: number; items: string[] }>("todos.pages").hasNextPage).toBe(true);

    await mesh.fetchNextResourcePage("todos.pages");
    const status = mesh.getResourceStatus<{ page: number; items: string[] }>("todos.pages");
    expect(status.data).toEqual({ page: 2, items: ["todo_1", "todo_2"] });
    expect(status.pages).toHaveLength(2);
    expect(status.hasNextPage).toBe(false);
  });

  it("prefetches, dehydrates, hydrates, and persists resource cache", async () => {
    const mesh = createAppMesh();
    let fetches = 0;

    const todosResource = mesh.resource("todos.list", {
      staleTime: "1m",
      async fetch(params: { userId: string }) {
        fetches += 1;
        return [{ id: params.userId, title: "Read docs" }];
      },
      tags: (_data, params) => [{ type: "todos", id: params.userId }]
    });

    await todosResource.prefetch({ userId: "1" });
    await mesh.prefetchResource("todos.list", { userId: "1" });
    expect(fetches).toBe(1);

    const snapshot = mesh.dehydrateResources({ tags: [{ type: "todos", id: "1" }] });
    expect(snapshot.entries).toHaveLength(1);

    const restored = createAppMesh();
    restored.resource("todos.list", {
      async fetch(params: { userId: string }) {
        return [{ id: params.userId, title: "Fresh" }];
      },
      tags: (_data, params) => [{ type: "todos", id: params.userId }]
    });
    restored.hydrateResources(snapshot);
    expect(restored.getResourceStatus<Array<{ id: string; title: string }>, { userId: string }>("todos.list", { userId: "1" }).data).toEqual([
      { id: "1", title: "Read docs" }
    ]);

    const storage = new Map<string, string>();
    const unsubscribe = mesh.persistResources({
      key: "resources",
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key)
      },
      names: ["todos.list"]
    });
    unsubscribe();

    const persisted = createAppMesh();
    persisted.resource("todos.list", {
      async fetch(params: { userId: string }) {
        return [{ id: params.userId, title: "Fresh" }];
      },
      tags: ["todos"]
    });
    persisted.persistResources({
      key: "resources",
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key)
      }
    });

    expect(persisted.getResourceStatus<Array<{ id: string; title: string }>, { userId: string }>("todos.list", { userId: "1" }).data).toEqual([
      { id: "1", title: "Read docs" }
    ]);
  });

  it("queues offline mutations and flushes them later", async () => {
    const mesh = createAppMesh();
    const originalOnline = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });

    try {
      mesh.mutation("todos.create", {
        offline: true,
        async mutate(payload: { title: string }) {
          return { id: "1", title: payload.title };
        },
        commit(state, todo) {
          state.todos.push(todo);
        }
      });

      const queued = mesh.runMutation("todos.create", { title: "Queued" });
      expect(mesh.getQueuedMutations()).toHaveLength(1);
      expect(mesh.getMutationStatus("todos.create").queued).toBe(true);

      Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
      await mesh.runQueuedMutations();
      await expect(queued).resolves.toEqual({ id: "1", title: "Queued" });

      expect(mesh.getQueuedMutations()).toHaveLength(0);
      expect(mesh.getMutationStatus("todos.create").queued).toBe(false);
      expect(mesh.getState().todos).toEqual([{ id: "1", title: "Queued" }]);
    } finally {
      if (originalOnline) Object.defineProperty(window.navigator, "onLine", originalOnline);
    }
  });

  it("normalizes, merges, removes, and denormalizes entities", () => {
    const mesh = createAppMesh();

    const initial = mesh.normalizeEntities([
      { id: "1", title: "One" },
      { id: "2", title: "Two" }
    ], "id");
    const merged = mesh.mergeEntities(initial, [
      { id: "2", title: "Two updated" },
      { id: "3", title: "Three" }
    ], "id");
    const removed = mesh.removeEntities(merged, ["1"]);

    expect(removed.allIds).toEqual(["2", "3"]);
    expect(mesh.denormalizeEntities(removed)).toEqual([
      { id: "2", title: "Two updated" },
      { id: "3", title: "Three" }
    ]);
  });
});

describe("createApiClient", () => {
  it("queues auth refresh and retries concurrent unauthorized requests once", async () => {
    let token = "old";
    let refreshes = 0;
    let requests = 0;

    const api = createApiClient({
      baseUrl: "https://api.example.test",
      getAccessToken: () => token,
      async refreshAuth() {
        refreshes += 1;
        token = "new";
        return token;
      },
      async fetcher(_input, init) {
        requests += 1;
        if ((init?.headers as Headers).get("Authorization") !== "Bearer new") {
          return new Response(null, { status: 401 });
        }
        return Response.json({ ok: true });
      }
    });

    await expect(Promise.all([
      api.get("/todos"),
      api.get("/todos")
    ])).resolves.toEqual([{ ok: true }, { ok: true }]);

    expect(refreshes).toBe(1);
    expect(requests).toBe(4);
  });

  it("retries configured HTTP failures with controllable delay and events", async () => {
    const events: string[] = [];
    let requests = 0;
    const api = createApiClient({
      baseUrl: "https://api.example.test",
      retry: {
        attempts: 2,
        delay: () => 0,
        retryOn: [503],
        jitter: false
      },
      onEvent(event) {
        events.push(event.type);
      },
      async fetcher() {
        requests += 1;
        if (requests < 3) return new Response(null, { status: 503 });
        return Response.json({ ok: true });
      }
    });

    await expect(api.get("/todos")).resolves.toEqual({ ok: true });
    expect(requests).toBe(3);
    expect(events.filter((event) => event === "api.request.retrying")).toHaveLength(2);
  });

  it("allows per-request retry overrides", async () => {
    let requests = 0;
    const api = createApiClient({
      baseUrl: "https://api.example.test",
      retry: {
        attempts: 3,
        delay: 0,
        retryOn: [500]
      },
      async fetcher() {
        requests += 1;
        return new Response(null, { status: 500 });
      }
    });

    await expect(api.get("/todos", { retry: false })).rejects.toMatchObject({
      status: 500
    });
    expect(requests).toBe(1);
  });

  it("times out requests and can retry timeouts when enabled", async () => {
    let requests = 0;
    const api = createApiClient({
      baseUrl: "https://api.example.test",
      timeout: 1,
      retry: {
        attempts: 1,
        delay: 0,
        retryTimeouts: true
      },
      async fetcher(_input, init) {
        requests += 1;
        return new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          setTimeout(() => resolve(Response.json({ ok: true })), 20);
        });
      }
    });

    await expect(api.get("/slow")).rejects.toMatchObject({
      code: "STATEMESH_API_TIMEOUT"
    });
    expect(requests).toBe(2);
  });
});
