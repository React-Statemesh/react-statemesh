import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMesh,
  ProviderError,
  StateMeshProvider,
  useMeshMutation,
  useMeshResource,
  useMeshSelector,
  useMeshState
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
