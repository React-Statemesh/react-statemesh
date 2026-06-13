import { expectType } from "tsd";
import { createMesh, useMeshAction, useMeshTransaction } from "../dist/index";

const mesh = createMesh({
  state: {
    theme: "light" as "light" | "dark",
    cart: {
      items: [] as Array<{ id: string; quantity: number }>
    }
  }
});

expectType<"light" | "dark">(mesh.getState().theme);

const addItem = mesh.action("cart.add", (state, payload: { id: string }) => {
  state.cart.items.push({ id: payload.id, quantity: 1 });
});

expectType<void>(addItem({ id: "keyboard" }));
expectType<(payload: { id: string }) => void>(useMeshAction(addItem));

const saveCart = mesh.transaction("cart.save", {
  async effect(_state, payload: { id: string }) {
    return { ok: Boolean(payload.id), id: payload.id };
  },
  commit(state, result) {
    expectType<boolean>(result.ok);
    state.cart.items.push({ id: result.id, quantity: 1 });
  }
});

expectType<(payload: { id: string }) => Promise<{ ok: boolean; id: string }>>(useMeshTransaction(saveCart).run);
