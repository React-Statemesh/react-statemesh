import { StateMeshProvider, createMesh, tabSyncPlugin, useMeshAction, useMeshComputed } from "@statemesh/react";

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

const mesh = createMesh({
  name: "ecommerce-cart",
  state: {
    theme: "light" as "light" | "dark",
    cart: {
      items: [] as CartItem[]
    }
  }
});

mesh.action("cart.addItem", (state, product: Omit<CartItem, "quantity">) => {
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

mesh.use(tabSyncPlugin({ keys: ["theme", "cart"], channel: "shopdesk-cart" }));

function CartDemo() {
  const addItem = useMeshAction<Omit<CartItem, "quantity">>("cart.addItem");
  const total = useMeshComputed<number>("cart.total");

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
