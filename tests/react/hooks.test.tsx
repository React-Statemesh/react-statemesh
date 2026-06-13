import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
