import { StateMeshProvider, createMesh, tabSyncPlugin, useMeshAction, useMeshComputed } from "statemesh-core";

const mesh = createMesh({
  name: "ecommerce-cart-js",
  state: {
    theme: "light",
    cart: {
      items: []
    }
  }
});

mesh.action("cart.addItem", (state, product) => {
  const existing = state.cart.items.find((item) => item.id === product.id);
  if (existing) existing.quantity += 1;
  else state.cart.items.push({ ...product, quantity: 1 });
});

mesh.computed("cart.total", {
  deps: ["cart.items"],
  compute: (state) => state.cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
});

mesh.persist({
  keys: ["theme", "cart.items"],
  storage: "localStorage",
  version: 1,
  ttl: "7d"
});

mesh.use(tabSyncPlugin({ keys: ["theme", "cart"], channel: "shopdesk-cart-js" }));

function CartDemo() {
  const addItem = useMeshAction("cart.addItem");
  const total = useMeshComputed("cart.total");

  return (
    <main>
      <button onClick={() => addItem({ id: "keyboard", name: "Keyboard", price: 100 })}>Add keyboard</button>
      <strong>Total: {total}</strong>
    </main>
  );
}

export default function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <CartDemo />
    </StateMeshProvider>
  );
}
