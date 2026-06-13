# StateMesh

StateMesh is a TypeScript-first, transaction-first state orchestration library for React. It starts with a small external store API, then adds the production pieces that usually become scattered across apps: named actions, optimized selectors, computed state, async transactions, optimistic UI, rollback, persistence, URL state, production forms, cross-tab sync, custom errors, logger hooks, and testing helpers.

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

## Resources, API Cache, And Mutations

Resources are cached API/server reads owned by the mesh. They cover the production loop: API call, loading state, cache, request dedupe, invalidation, refetch, pagination, and UI sync.

```ts
import { createApiClient } from "react-statemesh";

const api = createApiClient({
  baseUrl: "/api",
  getAccessToken: () => authStore.token,
  refreshAuth: () => authStore.refresh(),
  timeout: 10_000,
  retry: {
    attempts: 3,
    delay: ({ attempt }) => attempt * 500,
    retryOn: [408, 429, 500, 502, 503, 504],
    retryNetworkErrors: true,
    retryTimeouts: false,
    jitter: true
  },
  onEvent: (event) => {
    console.debug("[api]", event.type, event);
  }
});

export const productsResource = mesh.resource("products.list", {
  key: (filters: { search: string; page: number }) => ["products", filters],
  staleTime: "1m",
  cacheTime: "10m",
  async fetch(filters, ctx) {
    return api.get<Array<Product>>("/products", {
      query: filters,
      signal: ctx.signal
    });
  },
  tags: [{ type: "products" }]
});
```

```tsx
function ProductList({ filters }: { filters: { search: string; page: number } }) {
  const products = useMeshResource(productsResource, filters, {
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30000
  });

  if (products.pending) return <p>Loading...</p>;
  if (products.error) return <button onClick={() => products.refetch()}>Retry</button>;

  return (
    <ul>
      {products.data?.map((product) => <li key={product.id}>{product.name}</li>)}
    </ul>
  );
}
```

Prefetch before navigation or on hover:

```tsx
<button onMouseEnter={() => void productsResource.prefetch({ search: "", page: 1 })}>
  View products
</button>
```

Resource cache can be dehydrated for SSR, hydrated on the client, and persisted separately from app state:

```ts
const snapshot = mesh.dehydrateResources({ tags: [{ type: "products" }] });
mesh.hydrateResources(window.__STATEMESH_RESOURCES__);

mesh.persistResources({
  key: "shopdesk:resources",
  storage: "localStorage",
  names: ["products.list"],
  ttl: "10m"
});
```

Mutations are API/server writes with optimistic cache updates, rollback, invalidation, and refetch.

```ts
export const createProductMutation = mesh.mutation("products.create", {
  optimistic(_state, input: { name: string }, ctx) {
    ctx.setResourceData(productsResource, { search: "", page: 1 }, (current) => [
      { id: "temp", name: input.name, optimistic: true },
      ...(current ?? [])
    ]);
  },
  async mutate(input) {
    return api.post<Product>("/products", input);
  },
  invalidate: [{ type: "products" }],
  refetch: "active"
});
```

Mutations can queue while the browser is offline and flush on reconnect:

```ts
export const saveDraftMutation = mesh.mutation("draft.save", {
  offline: true,
  async mutate(input: DraftInput) {
    return api.post<Draft>("/drafts", input);
  }
});

await mesh.runQueuedMutations();
```

```tsx
function NewProductButton() {
  const createProduct = useMeshMutation(createProductMutation);
  return <button disabled={createProduct.pending} onClick={() => createProduct.run({ name: "Keyboard" })}>Create</button>;
}
```

For infinite/paginated APIs, add `getNextPageParam` and call `fetchNextPage`:

```ts
const feedResource = mesh.resource("feed.pages", {
  async fetch(_params, ctx) {
    return api.get<FeedPage>("/feed", { query: { cursor: String(ctx.pageParam ?? "") } });
  },
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  mergePages: (pages) => ({
    items: pages.flatMap((page) => page.items),
    nextCursor: pages.at(-1)?.nextCursor ?? null
  }),
  tags: ["feed"]
});
```

`createApiClient` is the central API layer. It includes base URLs, dynamic headers, auth tokens, query params, JSON request bodies, request cancellation, timeouts, retries, normalized `ApiClientError`s, event hooks, and an auth refresh queue so concurrent `401` responses share one refresh call.

Every API control can be configured globally or overridden per request:

```ts
api.get("/products", {
  timeout: false,
  retry: {
    attempts: 1,
    delay: 250,
    retryOn: (ctx) => ctx.status === 503
  },
  signal: abortController.signal
});
```

Retry is fully controllable: use a retry count, `false`, or an object with `attempts`, `delay`, `retryOn`, `retryNetworkErrors`, `retryTimeouts`, and `jitter`.

For list/detail cache sync, use the built-in entity helpers:

```ts
const normalized = mesh.normalizeEntities(products, (product) => product.id);
const merged = mesh.mergeEntities(normalized, [updatedProduct], (product) => product.id);
const list = mesh.denormalizeEntities(merged);
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
import { ApiClientError, zodSchema } from "react-statemesh";

export const updateProfileMutation = mesh.mutation("profile.update", {
  async mutate(values: { name: string; email: string }) {
    return api.put<User>("/profile", values);
  },
  commit(state, user) {
    state.user = user;
  }
});

mesh.form("profile.form", {
  initialValues: {
    name: "",
    email: "",
    links: [] as Array<{ url: string }>
  },
  schema: zodSchema(profileSchema),
  fields: {
    name(value) {
      return value.trim() ? null : "Name is required";
    },
    async email(value) {
      if (!value.includes("@")) return "Valid email is required";
      const available = await api.get<{ available: boolean }>("/users/email", {
        query: { email: value }
      });
      return available.available ? null : "Email is already taken";
    }
  },
  validateOnBlur: true,
  clearServerErrorOnChange: true,
  validate(values) {
    return {
      ...(values.name.length > 80 ? { name: "Name is too long" } : {})
    };
  },
  submit: updateProfileMutation,
  mapServerErrors(error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return cause instanceof ApiClientError && cause.status === 422
      ? { email: "Email is already taken" }
      : {};
  },
  autosave: {
    debounce: 800,
    validate: true,
    when: (form) => form.dirty && !form.submitting
  },
  steps: [
    { name: "profile", fields: ["name"] },
    { name: "contact", fields: ["email"] }
  ]
});
```

```tsx
function ProfileForm() {
  const form = useMeshForm<{
    name: string;
    email: string;
    links: Array<{ url: string }>;
  }>("profile.form");

  return (
    <form onSubmit={(event) => void form.submit(event).catch(() => undefined)}>
      <input {...form.field("name")} />
      {form.touched.name && form.errors.name && <p>{form.errors.name}</p>}
      <input {...form.field("email")} />
      {form.validatingFields.email && <p>Checking email...</p>}
      {form.errors.email && <p>{form.errors.email}</p>}
      {form.fieldArray("links").items.map((link, index) => (
        <input
          key={index}
          value={link.url}
          onChange={(event) => form.fieldArray("links").update(index, { url: event.target.value })}
        />
      ))}
      {form.autosaving && <p>Saving draft...</p>}
      <button disabled={form.submitting}>{form.submitting ? "Saving..." : "Save"}</button>
    </form>
  );
}
```

Forms support schema adapters, form-level validation, field-level validation, async validation, server errors, dirty field tracking, field arrays, reset-to-server data, autosave, mutation/transaction submit, and multi-step flows.

Useful form API:

- `form.field("email")` returns input props for React fields.
- `form.validateField("email")` runs one sync or async field validator.
- `form.fieldArray("links")` handles append, insert, update, remove, move, and replace for dynamic arrays.
- `form.setServerErrors({ email: "Already taken" })` stores API/server errors separately from client errors.
- `form.resetToServer(serverProfile)` replaces values and uses that payload as the new dirty baseline.
- `form.autosaveNow()` forces an autosave when autosave is configured.
- `form.nextStep()`, `form.previousStep()`, and `form.goToStep("contact")` handle wizard forms.

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

For development, you can render a lightweight in-app timeline:

```tsx
import { StateMeshDevtools } from "react-statemesh/devtools";

function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <Routes />
      <StateMeshDevtools mesh={mesh} />
    </StateMeshProvider>
  );
}
```

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
- `ResourceError`
- `MutationError`
- `ApiClientError`
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
- `examples/resource-cache`
- `examples/checkout-transaction`
- `examples/url-filters`
- `examples/persisted-cart`
- `examples/tab-sync`
- `examples/form-submit`
- `examples/nextjs-app`

Plain JavaScript React examples:

- `examples-js/basic-counter`
- `examples-js/ecommerce-cart`
- `examples-js/resource-cache`
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
