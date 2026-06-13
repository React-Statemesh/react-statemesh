import { StateMeshProvider, createMesh, useMeshTransaction } from "react-statemesh";

const mesh = createMesh({
  name: "checkout-transaction",
  state: {
    cart: {
      items: [{ id: "keyboard", price: 100, quantity: 1 }],
      status: "idle" as "idle" | "processing" | "completed" | "failed",
      error: null as string | null
    },
    order: null as null | { id: string; total: number }
  }
});

const checkoutTransaction = mesh.transaction("cart.checkout", {
  before(state) {
    if (state.cart.items.length === 0) throw new Error("Cart is empty");
  },
  optimistic(state) {
    state.cart.status = "processing";
    state.cart.error = null;
  },
  async effect(state, payload: { paymentMethodId: string }, context) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (context.signal.aborted) throw new Error("Cancelled");
    return {
      id: payload.paymentMethodId,
      total: state.cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    };
  },
  commit(state, order) {
    state.order = order;
    state.cart.items = [];
    state.cart.status = "completed";
  },
  rollback: true,
  onError(state, error) {
    state.cart.status = "failed";
    state.cart.error = error.message;
  },
  retry: { attempts: 2, delay: 500 },
  timeout: 10_000
}, { concurrency: "block" });

function CheckoutButton() {
  const checkout = useMeshTransaction(checkoutTransaction);

  return (
    <button disabled={checkout.pending} onClick={() => checkout.run({ paymentMethodId: "card_1" })}>
      {checkout.pending ? "Processing..." : "Pay now"}
    </button>
  );
}

export default function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <CheckoutButton />
    </StateMeshProvider>
  );
}
