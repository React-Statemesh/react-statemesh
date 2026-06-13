import { describe, expect, it, vi } from "vitest";
import { DuplicateRegistrationError, TransactionError, createMesh } from "../../src";

type CartState = {
  cart: {
    items: Array<{ id: string; price: number; quantity: number }>;
    status: "idle" | "processing" | "completed" | "failed";
    error: string | null;
  };
  order: { id: string; total: number } | null;
};

function createCartMesh() {
  return createMesh<CartState>({
    state: {
      cart: {
        items: [{ id: "keyboard", price: 100, quantity: 1 }],
        status: "idle",
        error: null
      },
      order: null
    }
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("transactions", () => {
  it("guards duplicate registrations and supports explicit replacement", async () => {
    const mesh = createCartMesh();

    mesh.transaction("cart.checkout", {
      async effect() {
        return { id: "order_1", total: 100 };
      }
    });

    expect(() =>
      mesh.transaction("cart.checkout", {
        async effect() {
          return { id: "order_2", total: 100 };
        }
      })
    ).toThrow(DuplicateRegistrationError);

    mesh.transaction("cart.checkout", {
      async effect() {
        return { id: "order_2", total: 100 };
      }
    }, { replace: true });

    await expect(mesh.runTransaction("cart.checkout", undefined)).resolves.toEqual({ id: "order_2", total: 100 });
  });

  it("runs optimistic, effect, and commit phases", async () => {
    const mesh = createCartMesh();
    mesh.transaction("cart.checkout", {
      optimistic(state) {
        state.cart.status = "processing";
      },
      async effect(state) {
        expect(state.cart.status).toBe("processing");
        return { id: "order_1", total: 100 };
      },
      commit(state, order) {
        state.order = order;
        state.cart.items = [];
        state.cart.status = "completed";
      },
      rollback: true
    });

    const order = await mesh.runTransaction("cart.checkout", undefined);
    expect(order).toEqual({ id: "order_1", total: 100 });
    expect(mesh.getState().cart.status).toBe("completed");
    expect(mesh.getState().cart.items).toHaveLength(0);
    expect(mesh.getTransactionStatus("cart.checkout").status).toBe("success");
  });

  it("rolls back optimistic state and applies onError state", async () => {
    const mesh = createCartMesh();
    mesh.transaction("cart.checkout", {
      optimistic(state) {
        state.cart.status = "processing";
        state.cart.items = [];
      },
      async effect() {
        throw new Error("Payment failed");
      },
      rollback: true,
      onError(state, error) {
        state.cart.status = "failed";
        state.cart.error = error.message;
      }
    });

    await expect(mesh.runTransaction("cart.checkout", undefined)).rejects.toThrow(TransactionError);
    expect(mesh.getState().cart.items).toHaveLength(1);
    expect(mesh.getState().cart.status).toBe("failed");
    expect(mesh.getState().cart.error).toBe("Payment failed");
    expect(mesh.getTransactionStatus("cart.checkout").status).toBe("error");
  });

  it("retries only the effect phase", async () => {
    const mesh = createCartMesh();
    const optimistic = vi.fn();
    let attempts = 0;

    mesh.transaction("cart.checkout", {
      optimistic(state) {
        optimistic();
        state.cart.status = "processing";
      },
      async effect() {
        attempts += 1;
        if (attempts < 2) throw new Error("temporary");
        return { id: "order_1", total: 100 };
      },
      commit(state, order) {
        state.order = order;
        state.cart.status = "completed";
      },
      rollback: true,
      retry: {
        attempts: 1
      }
    });

    await expect(mesh.runTransaction("cart.checkout", undefined)).resolves.toEqual({ id: "order_1", total: 100 });
    expect(attempts).toBe(2);
    expect(optimistic).toHaveBeenCalledTimes(1);
    expect(mesh.getTransactionStatus("cart.checkout").attempts).toBe(2);
  });

  it("blocks a second run when the transaction uses block concurrency", async () => {
    const mesh = createCartMesh();
    const deferred = createDeferred<{ id: string; total: number }>();

    mesh.transaction("cart.checkout", {
      async effect() {
        return deferred.promise;
      }
    }, { concurrency: "block" });

    const first = mesh.runTransaction("cart.checkout", undefined);
    await expect(mesh.runTransaction("cart.checkout", undefined)).rejects.toMatchObject({
      code: "STATEMESH_TRANSACTION_BLOCKED"
    });

    deferred.resolve({ id: "order_1", total: 100 });
    await expect(first).resolves.toEqual({ id: "order_1", total: 100 });
  });

  it("queues transaction runs when the transaction uses queue concurrency", async () => {
    const mesh = createCartMesh();
    const started: number[] = [];
    const finished: number[] = [];
    const releases: Array<() => void> = [];

    mesh.transaction("cart.checkout", {
      async effect(_state, payload: number) {
        started.push(payload);
        await new Promise<void>((resolve) => releases.push(resolve));
        finished.push(payload);
        return { id: `order_${payload}`, total: payload };
      }
    }, { concurrency: "queue" });

    const first = mesh.runTransaction("cart.checkout", 1);
    const second = mesh.runTransaction("cart.checkout", 2);
    await tick();

    expect(started).toEqual([1]);
    expect(finished).toEqual([]);

    releases[0]?.();
    await expect(first).resolves.toEqual({ id: "order_1", total: 1 });
    await tick();

    expect(started).toEqual([1, 2]);
    releases[1]?.();
    await expect(second).resolves.toEqual({ id: "order_2", total: 2 });
    expect(finished).toEqual([1, 2]);
  });

  it("keeps the latest optimistic run when takeLatest supersedes an older run", async () => {
    const mesh = createCartMesh();
    const first = createDeferred<{ id: string; total: number }>();
    const second = createDeferred<{ id: string; total: number }>();

    mesh.transaction("cart.checkout", {
      optimistic(state, payload: number) {
        state.cart.status = "processing";
        state.cart.items = [{ id: `pending_${payload}`, price: payload, quantity: 1 }];
      },
      async effect(_state, payload: number) {
        return payload === 1 ? first.promise : second.promise;
      },
      commit(state, order) {
        state.order = order;
        state.cart.status = "completed";
      },
      rollback: true
    });

    const firstRun = mesh.runTransaction("cart.checkout", 1);
    await tick();
    expect(mesh.getState().cart.items[0]?.id).toBe("pending_1");

    const secondRun = mesh.runTransaction("cart.checkout", 2);
    await tick();
    expect(mesh.getState().cart.items[0]?.id).toBe("pending_2");

    first.resolve({ id: "order_1", total: 1 });
    await expect(firstRun).rejects.toThrow(TransactionError);
    expect(mesh.getState().cart.items[0]?.id).toBe("pending_2");

    second.resolve({ id: "order_2", total: 2 });
    await expect(secondRun).resolves.toEqual({ id: "order_2", total: 2 });
    expect(mesh.getState().order).toEqual({ id: "order_2", total: 2 });
    expect(mesh.getState().cart.items[0]?.id).toBe("pending_2");
  });
});
