# StateMesh JavaScript React Examples

These examples mirror the TypeScript examples in `examples/`, but use plain React JavaScript with `.jsx` files.

StateMesh is TypeScript-first, not TypeScript-only. JavaScript users can import and use the same runtime APIs:

```jsx
import { StateMeshProvider, createMesh, useMeshState } from "statemesh-core";

const mesh = createMesh({
  state: {
    count: 0
  }
});

function Counter() {
  const [count, setCount] = useMeshState("count");
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
}

export default function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <Counter />
    </StateMeshProvider>
  );
}
```

Included examples:

- `basic-counter`
- `ecommerce-cart`
- `resource-cache`
- `checkout-transaction`
- `url-filters`
- `persisted-cart`
- `tab-sync`
- `form-submit`
- `realworld-support-desk`
- `nextjs-app`

Use `realworld-support-desk` when you want the broadest JavaScript reference. It combines API data, cache state, mutation submit, forms, autosave, persistence, and devtools in one realistic app.
