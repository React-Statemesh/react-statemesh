import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMesh,
  MeshComponent,
  MeshErrorBoundary,
  ProviderError,
  StateMeshProvider,
  useMeshMutation,
  useMeshResource,
  useMeshSelector,
  useMeshState,
  useSuspenseMeshResource
} from "../../src";

describe("React hooks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.querySelectorAll("script[src*='@vite/client']").forEach((script) => script.remove());
  });

  it("throws ProviderError outside the provider", () => {
    function Broken() {
      useMeshSelector("theme");
      return null;
    }

    expect(() => render(<Broken />)).toThrow(ProviderError);
  });

  it("subscribes to selected state through the provider", () => {
    const mesh = createMesh({
      state: {
        theme: "light" as "light" | "dark"
      }
    });

    function ThemeToggle() {
      const [theme, setTheme] = useMeshState<"light" | "dark">("theme");
      return <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme}</button>;
    }

    render(
      <StateMeshProvider mesh={mesh}>
        <ThemeToggle />
      </StateMeshProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(screen.getByRole("button", { name: "dark" })).toBeTruthy();
  });

  it("subscribes to resource and mutation updates through the provider", async () => {
    const mesh = createMesh({
      state: {}
    });
    const todosResource = mesh.resource("todos.list", {
      async fetch() {
        return [{ id: "1", title: "Read docs" }];
      },
      tags: ["todos"]
    });
    const createTodoMutation = mesh.mutation("todos.create", {
      optimistic(_state, payload: { title: string }, context) {
        context.setResourceData(todosResource, undefined, (current) => [
          ...(current ?? []),
          { id: "temp", title: payload.title }
        ]);
      },
      async mutate(_payload: { title: string }) {
        return { ok: true };
      }
    });

    function Todos() {
      const todos = useMeshResource(todosResource);
      const createTodo = useMeshMutation(createTodoMutation);

      return (
        <section>
          <span>{todos.pending ? "loading" : `todos:${todos.data?.length ?? 0}`}</span>
          <button onClick={() => createTodo.run({ title: "Ship" })}>add</button>
        </section>
      );
    }

    render(
      <StateMeshProvider mesh={mesh}>
        <Todos />
      </StateMeshProvider>
    );

    await waitFor(() => expect(screen.getByText("todos:1")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "add" }));
    await waitFor(() => expect(screen.getByText("todos:2")).toBeTruthy());
  });

  it("tracks StateMesh hook usage under MeshComponent boundaries", async () => {
    const mesh = createMesh({
      state: {
        count: 1
      }
    });
    const profileResource = mesh.resource("profile.read", {
      async fetch() {
        return { name: "Ada" };
      },
      tags: ["profile"]
    });

    function Dashboard() {
      const [count] = useMeshState<number>("count");
      const profile = useMeshResource(profileResource);
      return <span>{profile.data?.name ?? count}</span>;
    }

    const view = render(
      <StateMeshProvider mesh={mesh}>
        <MeshComponent name="Dashboard">
          <Dashboard />
        </MeshComponent>
      </StateMeshProvider>
    );

    await waitFor(() => expect(screen.getByText("Ada")).toBeTruthy());
    await waitFor(() => {
      const tracked = mesh.getDevtoolsSnapshot().components.find((component) => component.name === "Dashboard");
      expect(tracked?.renderCount).toBeGreaterThan(0);
      expect(tracked?.usages.some((usage) => usage.kind === "state" && usage.name === "count")).toBe(true);
      expect(tracked?.usages.some((usage) => usage.kind === "resource" && usage.name === "profile.read")).toBe(true);
    });

    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mesh.getDevtoolsSnapshot().components).toHaveLength(0);
  });

  it("supports resource placeholder data and selectors", async () => {
    const mesh = createMesh({ state: {} });
    let resolveTodos!: (todos: Array<{ id: string; title: string }>) => void;
    const todosResource = mesh.resource("todos.selected", {
      async fetch() {
        return new Promise<Array<{ id: string; title: string }>>((resolve) => {
          resolveTodos = resolve;
        });
      }
    });

    function Todos() {
      const todos = useMeshResource(todosResource, undefined, {
        placeholderData: [{ id: "placeholder", title: "Placeholder" }],
        select: (data) => data?.map((todo) => todo.title).join(", ") ?? "none"
      });

      return <span>{todos.data}</span>;
    }

    render(
      <StateMeshProvider mesh={mesh}>
        <Todos />
      </StateMeshProvider>
    );

    expect(screen.getByText("Placeholder")).toBeTruthy();
    await waitFor(() => expect(resolveTodos).toBeTypeOf("function"));
    await act(async () => {
      resolveTodos([{ id: "1", title: "Real" }]);
    });
    await waitFor(() => expect(screen.getByText("Real")).toBeTruthy());
  });

  it("keeps previous resource data while new params load", async () => {
    const mesh = createMesh({ state: {} });
    const resolvers = new Map<number, (value: { page: number; title: string }) => void>();
    const pagesResource = mesh.resource("todos.pages.selected", {
      async fetch(params: { page: number }) {
        return new Promise<{ page: number; title: string }>((resolve) => {
          resolvers.set(params.page, resolve);
        });
      }
    });

    function Todos() {
      const [page, setPage] = useState(1);
      const todos = useMeshResource(pagesResource, { page }, {
        keepPreviousData: true
      });

      return (
        <section>
          <span>{todos.data?.title ?? "loading"}</span>
          <button onClick={() => setPage(2)}>next</button>
        </section>
      );
    }

    render(
      <StateMeshProvider mesh={mesh}>
        <Todos />
      </StateMeshProvider>
    );

    await waitFor(() => expect(resolvers.get(1)).toBeTruthy());
    await act(async () => {
      resolvers.get(1)?.({ page: 1, title: "Page 1" });
    });
    await waitFor(() => expect(screen.getByText("Page 1")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getByText("Page 1")).toBeTruthy();
    await waitFor(() => expect(resolvers.get(2)).toBeTruthy());
    await act(async () => {
      resolvers.get(2)?.({ page: 2, title: "Page 2" });
    });
    await waitFor(() => expect(screen.getByText("Page 2")).toBeTruthy());
  });

  it("suspends until a resource resolves and returns non-null data", async () => {
    const mesh = createMesh({ state: {} });
    let resolveTodos!: (value: Array<{ id: string; title: string }>) => void;
    const todosResource = mesh.resource("todos.suspense", {
      fetch() {
        return new Promise<Array<{ id: string; title: string }>>((resolve) => {
          resolveTodos = resolve;
        });
      }
    });

    function Todos() {
      const todos = useSuspenseMeshResource(todosResource);
      return <span>{todos.data[0]?.title}</span>;
    }

    render(
      <StateMeshProvider mesh={mesh}>
        <Suspense fallback={<span>Loading suspense</span>}>
          <Todos />
        </Suspense>
      </StateMeshProvider>
    );

    expect(screen.getByText("Loading suspense")).toBeTruthy();
    await waitFor(() => expect(resolveTodos).toBeTypeOf("function"));
    await act(async () => {
      resolveTodos([{ id: "1", title: "Suspense ready" }]);
    });

    await waitFor(() => expect(screen.getByText("Suspense ready")).toBeTruthy());
  });

  it("retries a failed suspense resource through MeshErrorBoundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const mesh = createMesh({ state: {} });
    let attempts = 0;
    const todosResource = mesh.resource("todos.suspense.retry", {
      async fetch() {
        attempts += 1;
        if (attempts === 1) throw new Error("Temporary failure");
        return [{ id: "1", title: "Recovered" }];
      }
    });

    function Todos() {
      const todos = useSuspenseMeshResource(todosResource);
      return <span>{todos.data[0]?.title}</span>;
    }

    render(
      <StateMeshProvider mesh={mesh}>
        <MeshErrorBoundary fallbackRender={({ error, reset }) => (
          <button type="button" onClick={reset}>{error.message}: retry</button>
        )}>
          <Suspense fallback={<span>Loading retry</span>}>
            <Todos />
          </Suspense>
        </MeshErrorBoundary>
      </StateMeshProvider>
    );

    const retryButton = await screen.findByRole("button", { name: /failed to fetch.*retry/i });
    fireEvent.click(retryButton);

    await waitFor(() => expect(screen.getByText("Recovered")).toBeTruthy());
    expect(attempts).toBe(2);
  });

  it("supports reconnect refetch, focus refetch, and prefetch from hooks", async () => {
    const mesh = createMesh({ state: {} });
    let version = 0;
    const todosResource = mesh.resource("todos.live", {
      async fetch() {
        version += 1;
        return [{ id: String(version), title: `Todo ${version}` }];
      }
    });

    function Todos() {
      const todos = useMeshResource(todosResource, undefined, {
        refetchOnReconnect: "always",
        refetchOnWindowFocus: "always"
      });

      return (
        <section>
          <span>{todos.data?.[0]?.title ?? "loading"}</span>
          <button onClick={() => void todos.prefetch()}>prefetch</button>
        </section>
      );
    }

    const view = render(
      <StateMeshProvider mesh={mesh}>
        <Todos />
      </StateMeshProvider>
    );

    await waitFor(() => expect(screen.getByText("Todo 1")).toBeTruthy());

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(screen.getByText("Todo 2")).toBeTruthy());

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(screen.getByText("Todo 3")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "prefetch" }));
    await waitFor(() => expect(screen.getByText("Todo 4")).toBeTruthy());
    view.unmount();
  });

  it("supports resource polling from hooks", async () => {
    const mesh = createMesh({ state: {} });
    let version = 0;
    const todosResource = mesh.resource("todos.poll", {
      async fetch() {
        version += 1;
        return [{ id: String(version), title: `Todo ${version}` }];
      }
    });

    function Todos() {
      const todos = useMeshResource(todosResource, undefined, {
        refetchInterval: 20
      });

      return <span>{todos.data?.[0]?.title ?? "loading"}</span>;
    }

    const view = render(
      <StateMeshProvider mesh={mesh}>
        <Todos />
      </StateMeshProvider>
    );

    await waitFor(() => expect(version).toBeGreaterThanOrEqual(2));
    view.unmount();
  });

  it("connects to Vite's dev websocket for full reload guarding", async () => {
    const mesh = createMesh({ state: {} });
    const script = document.createElement("script");
    script.src = "/@vite/client";
    document.head.appendChild(script);
    const sockets: Array<{ url: string; protocol?: string; close: () => void }> = [];

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => 'const wsToken = "state-token";'
    })));

    vi.stubGlobal("WebSocket", class {
      readonly url: string;
      readonly protocol?: string;

      constructor(url: string, protocol?: string) {
        this.url = url;
        this.protocol = protocol;
        sockets.push(this);
      }

      addEventListener() {
        // The reload behavior is owned by the browser; this test verifies the standalone Vite connection.
      }

      close = vi.fn();
    });

    const view = render(
      <StateMeshProvider mesh={mesh}>
        <span>ready</span>
      </StateMeshProvider>
    );

    await waitFor(() => expect(sockets).toHaveLength(1));
    expect(new URL(sockets[0]!.url).searchParams.get("token")).toBe("state-token");
    expect(sockets[0]!.protocol).toBe("vite-hmr");

    view.unmount();
    expect(sockets[0]!.close).toHaveBeenCalledOnce();
  });

  it("forces reload when Vite reports a hot updated module through console debug", async () => {
    const mesh = createMesh({ state: {} });
    const script = document.createElement("script");
    script.src = "/@vite/client";
    document.head.appendChild(script);
    const scheduled: Array<() => void> = [];

    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => 'const wsToken = "state-token";'
    }));
    vi.stubGlobal("fetch", fetchMock);

    vi.stubGlobal("WebSocket", class {
      addEventListener() {
        // The console bridge handles this test.
      }

      close = vi.fn();
    });

    const view = render(
      <StateMeshProvider mesh={mesh}>
        <span>ready</span>
      </StateMeshProvider>
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const timeout = vi.spyOn(globalThis, "setTimeout").mockImplementation((handler: TimerHandler) => {
      if (typeof handler === "function") scheduled.push(handler as () => void);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });

    console.debug("[vite]", "hot updated: /src/App.jsx");

    expect(timeout).toHaveBeenCalledOnce();
    expect(scheduled).toHaveLength(1);
    view.unmount();
  });

  it("can disable the Vite full reload guard", async () => {
    const mesh = createMesh({ state: {} });
    const script = document.createElement("script");
    script.src = "/@vite/client";
    document.head.appendChild(script);
    const fetch = vi.fn();

    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("WebSocket", class {
      constructor() {
        throw new Error("WebSocket should not be created when the guard is disabled.");
      }
    });

    render(
      <StateMeshProvider mesh={mesh} devForceFullReload={false}>
        <span>ready</span>
      </StateMeshProvider>
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
  });
});
