# StateMesh

StateMesh is a TypeScript-first, transaction-first state orchestration library for React. It starts with a small external store API, then adds the production pieces that usually become scattered across apps: named actions, optimized selectors, computed state, async transactions, optimistic UI, rollback, persistence, URL state, lightweight forms, cross-tab sync, custom errors, logger hooks, and testing helpers.

```bash
npm install react-statemesh
```

## Quick Start

```tsx
import { StateMeshProvider, createMesh, useMeshState } from "react-statemesh";

const mesh = createMesh({
  name: "shopdesk",
  state: {
    theme: "light" as "light" | "dark"
  }
});

function ThemeToggle() {
  const [theme, setTheme] = useMeshState<"light" | "dark">("theme");

  return (
    <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      Current theme: {theme}
    </button>
  );
}

export function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <ThemeToggle />
    </StateMeshProvider>
  );
}
```

The provider only passes the mesh instance through React context. State reads use `useSyncExternalStore`, so updating `theme` does not rerender unrelated consumers.

## Core API

```ts
const mesh = createMesh({
  state: {
    cart: {
      items: [],
      status: "idle",
      error: null
    },
    order: null
  }
});

mesh.getState();
mesh.setState({ order: null });
mesh.setPath("cart.status", "processing");
mesh.reset();
mesh.destroy();
```

Subscriptions can target a path or a selector:

```ts
const unsubscribe = mesh.subscribe(
  (state) => state.cart.items.length,
  (count) => console.log(count)
);
```

## Actions

Actions are named synchronous state changes. Handlers receive a draft copy so examples can stay natural and mutable without mutating the initial state object.

```ts
mesh.action("cart.addItem", (state, product: { id: string; name: string; price: number }) => {
  const existing = state.cart.items.find((item) => item.id === product.id);
  if (existing) existing.quantity += 1;
  else state.cart.items.push({ ...product, quantity: 1 });
});
```

`mesh.action` returns a callable typed reference. You can call it directly, export it from an actions file, or pass it to `useMeshAction` so payload/result types are inferred without repeating generics.

```ts
export const addItemAction = mesh.action("cart.addItem", (state, product: Product) => {
  state.cart.items.push({ ...product, quantity: 1 });
});
```

```tsx
function AddToCart({ product }: { product: Product }) {
  const addItem = useMeshAction(addItemAction);
  return <button onClick={() => addItem(product)}>Add</button>;
}
```

Action failures are wrapped in `ActionError` with metadata.

## Registration And Replacement

Named registrations are guarded by default. Registering the same action, transaction, computed value, form, URL state, or plugin twice throws `DuplicateRegistrationError`.

```ts
mesh.action("cart.addItem", addItemHandler);

// Useful in tests, story files, HMR setup code, or explicit reconfiguration.
mesh.action("cart.addItem", mockedAddItemHandler, { replace: true });
mesh.transaction("cart.checkout", checkoutDefinition, { replace: true });
mesh.computed("cart.total", totalDefinition, { replace: true });
mesh.form("profile.form", profileFormDefinition, { replace: true });
mesh.urlState("products.filters", filterDefaults, { replace: true });
```

## Selectors And Computed State

```tsx
import { useMeshSelector, useMeshComputed } from "react-statemesh";

function CartBadge() {
  const count = useMeshSelector((state: AppState) =>
    state.cart.items.reduce((total, item) => total + item.quantity, 0)
  );
  return <span>Cart: {count}</span>;
}

mesh.computed("cart.total", {
  deps: ["cart.items"],
  compute: (state) => state.cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
});

function CartTotal() {
  const total = useMeshComputed<number>("cart.total");
  return <strong>Total: {total}</strong>;
}
```

Computed values are cached and recompute when their dependency paths change.

## Transactions

Transactions own the full lifecycle: validation, snapshot, optimistic update, effect, commit, rollback, retry, timeout, cancellation, status, and logging.

```ts
export const checkoutTransaction = mesh.transaction("cart.checkout", {
  before(state) {
    if (state.cart.items.length === 0) throw new Error("Cart is empty");
  },
  optimistic(state) {
    state.cart.status = "processing";
    state.cart.error = null;
  },
  async effect(state, payload: { paymentMethodId: string }, ctx) {
    const response = await fetch("/api/checkout", {
      method: "POST",
      signal: ctx.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: state.cart.items, paymentMethodId: payload.paymentMethodId })
    });
    if (!response.ok) throw new Error("Checkout failed");
    return response.json() as Promise<{ id: string; total: number }>;
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
  retry: { attempts: 2, delay: 1000 },
  timeout: 10000
});
```

Transaction registration accepts a concurrency policy:

```ts
mesh.transaction("search.products", searchDefinition, {
  concurrency: "takeLatest"
});
```

- `takeLatest` is the default. It aborts and rolls back the previous pending optimistic run, then starts the newest run.
- `block` rejects a new run while the previous run is pending with `STATEMESH_TRANSACTION_BLOCKED`.
- `queue` runs calls one after another in call order.

```tsx
function CheckoutButton() {
  const checkout = useMeshTransaction(checkoutTransaction);

  return (
    <button disabled={checkout.pending} onClick={() => checkout.run({ paymentMethodId: "card_1" })}>
      {checkout.pending ? "Processing..." : "Pay now"}
    </button>
  );
}
```

## Persistence

Persistence is opt-in and whitelist-first.

```ts
mesh.persist({
  storage: "localStorage",
  keys: ["theme", "cart.items"],
  version: 1,
  ttl: "7d"
});
```

Adapters are exported from `react-statemesh/persist`:

```ts
import { createMemoryStorageAdapter, persistPlugin } from "react-statemesh/persist";

mesh.use(persistPlugin({
  key: "shopdesk",
  storage: createMemoryStorageAdapter("tests"),
  keys: ["theme"],
  version: 1
}));
```

Corrupted persisted data is ignored instead of crashing the app. Version migrations and TTL expiration are supported.

StateMesh only writes persistence again when one of the whitelisted paths changes, so unrelated state updates do not keep touching storage.

## URL State

```ts
mesh.urlState("products.filters", {
  search: "",
  category: "all",
  page: 1,
  sort: "latest"
});
```

```tsx
function ProductFilters() {
  const [filters, setFilters] = useMeshUrlState<{
    search: string;
    category: string;
    page: number;
    sort: string;
  }>("products.filters");

  return (
    <input value={filters.search} onChange={(event) => setFilters({ search: event.target.value, page: 1 })} />
  );
}
```

URL state is SSR-guarded, supports push/replace mode, debounce, custom serializers, numbers, booleans, arrays, and back/forward updates.

## Forms

```ts
mesh.form("profile.form", {
  initialValues: {
    name: "",
    email: ""
  },
  validate(values) {
    return {
      ...(values.name ? {} : { name: "Name is required" }),
      ...(values.email.includes("@") ? {} : { email: "Valid email is required" })
    };
  },
  submit: "profile.update"
});
```

```tsx
function ProfileForm() {
  const form = useMeshForm<{ name: string; email: string }>("profile.form");

  return (
    <form onSubmit={form.submit}>
      <input {...form.field("name")} />
      <input {...form.field("email")} />
      <button disabled={form.submitting}>{form.submitting ? "Saving..." : "Save"}</button>
    </form>
  );
}
```

Forms expose `values`, `errors`, `touched`, `dirty`, `submitting`, `submitted`, `field`, `setValue`, `setError`, `reset`, `validate`, and `submit`.

## Cross-Tab Sync

```ts
import { tabSyncPlugin } from "react-statemesh/sync";

mesh.use(tabSyncPlugin({
  keys: ["theme", "cart"],
  channel: "shopdesk-state",
  strategy: "latest-wins"
}));
```

StateMesh uses `BroadcastChannel` when available and falls back to `localStorage` storage events. Each message includes a source tab ID to prevent loops.

## Middleware, Plugins, And Logger

```ts
mesh.middleware((event) => {
  analytics.track(event.type);
});

mesh.use(loggerPlugin({
  enabled: process.env.NODE_ENV === "development",
  mask: ["user.email", "auth.token", "payment.card"]
}));
```

Plugins have `name`, `setup`, cleanup, and event access. Duplicate plugin names are rejected.

Middleware and event listeners are observational. Synchronous throws and rejected promises are isolated so analytics, logging, or devtools code cannot break state updates.

## Errors

StateMesh exports a predictable error hierarchy:

- `StateMeshError`
- `ProviderError`
- `SelectorError`
- `ComputedError`
- `ActionError`
- `DuplicateRegistrationError`
- `TransactionError`
- `TransactionRollbackError`
- `PersistenceError`
- `UrlStateError`
- `FormError`
- `SyncError`

Each error includes `name`, `code`, `cause`, `metadata`, and `timestamp`.

## Testing

```ts
import { createTestMesh } from "react-statemesh/testing";

const mesh = createTestMesh({
  state: {
    cart: { items: [], status: "idle", error: null }
  }
});

mesh.mockTransactionEffect("cart.checkout", async () => {
  throw new Error("Payment failed");
});

mesh.assertTransactionStatus("cart.checkout", "error");
```

## Package Scripts

```bash
pnpm typecheck
pnpm test
pnpm test:types
pnpm build
```

## Editor IntelliSense

StateMesh ships production TSDoc/JSDoc comments in its generated `.d.ts` files. Editors such as VS Code show these descriptions, parameter notes, return types, and examples when developers hover imports, hooks, mesh methods, options, errors, and plugin helpers.

This works for TypeScript projects automatically. Plain JavaScript React projects also get the same hover documentation when the editor can read package types from `node_modules`.

## Examples

TypeScript React examples:

- `examples/basic-counter`
- `examples/ecommerce-cart`
- `examples/checkout-transaction`
- `examples/url-filters`
- `examples/persisted-cart`
- `examples/tab-sync`
- `examples/form-submit`
- `examples/nextjs-app`

Plain JavaScript React examples:

- `examples-js/basic-counter`
- `examples-js/ecommerce-cart`
- `examples-js/checkout-transaction`
- `examples-js/url-filters`
- `examples-js/persisted-cart`
- `examples-js/tab-sync`
- `examples-js/form-submit`
- `examples-js/nextjs-app`

## Production Notes

- React is a peer dependency.
- Browser APIs are guarded for SSR and Next.js App Router usage.
- Persistence and tab sync are explicit whitelist features.
- Logs do not dump full state by default and can mask sensitive metadata.
- The core has no runtime dependency on Redux, Zustand, Immer, or validation libraries.
