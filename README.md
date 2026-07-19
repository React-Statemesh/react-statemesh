<p align="center">
  <a href="https://react-statemesh.github.io/statemesh-docs">
    <img src="logo.png" alt="StateMesh" width="120" height="120" />
  </a>
</p>

<h1 align="center">StateMesh</h1>

<p align="center">
  <strong>Transaction-first state for React</strong>
</p>

<p align="center">
  Every state change is a transaction. Optimistic UI, rollback, retry, undo/redo, time travel, routing, forms, persistence, cross-tab sync — all automatic. Zero dependencies. One mesh.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/statemesh-core"><img src="https://img.shields.io/npm/v/statemesh-core?style=flat-square&color=blue" alt="npm version" /></a>
  <a href="https://bundlephobia.com/package/statemesh-core"><img src="https://img.shields.io/bundlephobia/minzip/statemesh-core?style=flat-square" alt="bundle size" /></a>
  <a href="https://github.com/React-Statemesh/react-statemesh/blob/master/LICENSE"><img src="https://img.shields.io/npm/l/statemesh-core?style=flat-square&color=green" alt="license" /></a>
  <a href="https://www.npmjs.com/package/statemesh-core"><img src="https://img.shields.io/npm/dm/statemesh-core?style=flat-square" alt="downloads" /></a>
</p>

---

## Why StateMesh?

**One store for everything.** State, server cache, forms, URL parameters, routing, cross-tab sync, undo history — all live in one store with one set of types. No more wiring together 5 libraries with different mental models.

**Every state change is a transaction.** Validate, optimistic update, effect, commit, rollback — all automatic. Retry with exponential backoff, timeout, and cancellation.

**Subscriptions that never waste renders.** Path-scoped selectors with equality checking. Updating `cart.items` does not rerender components reading `theme`.

**Zero runtime dependencies.** React is the only peer dependency.

---

## Quick Start

```bash
npm install statemesh-core
```

```tsx
import { createMesh, StateMeshProvider, useMeshState } from "statemesh-core";

const mesh = createMesh({
  state: { count: 0 }
});

function Counter() {
  const [count, setCount] = useMeshState<number>("count");
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
}

export function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <Counter />
    </StateMeshProvider>
  );
}
```

---

## Features

| Feature | What it does |
|---------|-------------|
| [**State**](https://react-statemesh.github.io/statemesh-docs/core/state) | External store with path-based subscriptions, `useSyncExternalStore` |
| [**Actions**](https://react-statemesh.github.io/statemesh-docs/core/actions) | Named state mutations with payloads and handlers |
| [**Selectors & Computed**](https://react-statemesh.github.io/statemesh-docs/core/selectors) | Derived state, memoization, dependency tracking |
| [**Transactions**](https://react-statemesh.github.io/statemesh-docs/core/transactions) | Async lifecycle — validate, optimistic, effect, commit, rollback |
| [**Undo / Redo**](https://react-statemesh.github.io/statemesh-docs/core/undo-redo) | Automatic history tracking with configurable depth |
| [**Time Travel**](https://react-statemesh.github.io/statemesh-docs/core/time-travel) | Replay to any point in time |
| [**Middleware Pipelines**](https://react-statemesh.github.io/statemesh-docs/core/middleware-pipelines) | Intercept, transform, log, and guard state changes |
| [**Resources**](https://react-statemesh.github.io/statemesh-docs/data/resources) | Cached API reads with deduplication, polling, pagination |
| [**Mutations**](https://react-statemesh.github.io/statemesh-docs/data/mutations) | Write operations with optimistic rollback and offline queue |
| [**API Client**](https://react-statemesh.github.io/statemesh-docs/data/api-client) | Built-in HTTP client with interceptors and retry |
| [**Persistence**](https://react-statemesh.github.io/statemesh-docs/data/persistence) | localStorage, sessionStorage, IndexedDB, cross-tab sync |
| [**Forms**](https://react-statemesh.github.io/statemesh-docs/ui/forms) | Async validation, schema adapters, field arrays, autosave |
| [**URL State**](https://react-statemesh.github.io/statemesh-docs/ui/url-state) | Sync state with URL search params |
| [**Router**](https://react-statemesh.github.io/statemesh-docs/router/) | Routing IS state management — transactions, loaders, guards |
| [**DevTools**](https://react-statemesh.github.io/statemesh-docs/advanced/devtools) | Timeline, profiler, diagnostics, state inspector |
| [**Testing**](https://react-statemesh.github.io/statemesh-docs/testing/) | Mock helpers, assertions, async utilities |

---

## Example: Transaction with Optimistic UI

```ts
const checkout = mesh.transaction("cart.checkout", {
  optimistic(state) {
    state.cart.status = "processing";
  },
  async effect(state, payload, ctx) {
    return fetch("/api/checkout", { signal: ctx.signal });
  },
  commit(state, result) {
    state.order = result;
    state.cart.items = [];
  },
  rollback: true,
  retry: { attempts: 3, delay: backoff() }
});
```

```tsx
function CheckoutButton() {
  const tx = useMeshTransaction(checkout);
  return (
    <button disabled={tx.pending} onClick={() => tx.run({ paymentMethodId: "card_1" })}>
      {tx.pending ? "Processing..." : "Pay now"}
    </button>
  );
}
```

---

## Example: Router with Data Loading

```ts
const routes = defineRoutes([
  {
    path: "/products",
    component: () => import("./pages/Products"),
    loader: ({ mesh }) => mesh.resource("products.list").fetch(),
    children: [
      {
        path: ":id",
        component: () => import("./pages/ProductDetail"),
        loader: ({ params, mesh }) => mesh.resource("product.detail").fetch({ id: params.id })
      }
    ]
  }
]);
```

```tsx
function Layout() {
  return (
    <div>
      <nav>
        <Link to="/products">Products</Link>
      </nav>
      <Outlet />
    </div>
  );
}
```

---

## Documentation

Full documentation is available at **[react-statemesh.github.io/statemesh-docs](https://react-statemesh.github.io/statemesh-docs)**

| Section | What's covered |
|---------|---------------|
| [**Guide**](https://react-statemesh.github.io/statemesh-docs/guide/) | Installation, core concepts, TypeScript |
| [**Core**](https://react-statemesh.github.io/statemesh-docs/core/) | State, actions, selectors, transactions, undo/redo |
| [**Data**](https://react-statemesh.github.io/statemesh-docs/data/) | Resources, mutations, API client, persistence |
| [**UI**](https://react-statemesh.github.io/statemesh-docs/ui/) | Forms, URL state, error boundaries |
| [**Router**](https://react-statemesh.github.io/statemesh-docs/router/) | Routes, navigation, guards, data loading, SEO |
| [**Advanced**](https://react-statemesh.github.io/statemesh-docs/advanced/) | Middleware, guards, plugins, sync, devtools |
| [**Testing**](https://react-statemesh.github.io/statemesh-docs/testing/) | Test helpers and patterns |
| [**Integration**](https://react-statemesh.github.io/statemesh-docs/integration/) | Next.js, migration from other libraries |
| [**API Reference**](https://react-statemesh.github.io/statemesh-docs/reference/errors) | Error codes, events, changelog |

---

## Test Coverage

**603 tests** across 19 test files covering every module, API surface, error path, and edge case.

```bash
pnpm test           # Full suite
pnpm test:types     # Type tests only
pnpm test:watch     # Watch mode
```

---

## Production Notes

- **Zero runtime dependencies** — React is a peer dependency
- **100% TypeScript** — type-safe paths, discriminated events, generic inference
- **SSR-safe** — all browser APIs guarded, dehydrate/hydrate for server rendering
- **Tree-shakeable** — router, devtools, and testing are separate entry points
- **Bounded memory** — LRU caches, ring buffers, snapshot limits

---

## License

[MIT](LICENSE)
