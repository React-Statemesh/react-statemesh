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

In Vite development, `StateMeshProvider` forces a full browser reload on hot-update errors by default. This prevents Fast Refresh from leaving the last successful UI visible after a broken save, so missing imports and wrong runtime names fail immediately on save. StateMesh also treats repeated named registrations during Vite HMR as replacements, so re-saving a module that registers `cart.addItem` does not throw a development-only duplicate registration error. Disable the reload guard with `<StateMeshProvider mesh={mesh} devForceFullReload={false}>` when you prefer normal Fast Refresh behavior.

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

During Vite browser HMR, duplicate named registrations are automatically treated like `{ replace: true }` so hot updates can re-run action/form/resource setup files safely. Production builds still reject accidental duplicates, and non-Vite environments should use explicit `{ replace: true }` when replacing a registration intentionally.

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

For selector-heavy components, `createSelector` creates a memoized selector that only recomputes when its dependency inputs change. This avoids unnecessary work on every render when the underlying data has not shifted:

```tsx
import { createSelector } from "react-statemesh";

const selectCartCount = createSelector(
  (state: AppState) => state.cart.items,
  (items) => items.reduce((total, item) => total + item.quantity, 0)
);

const selectCartTotal = createSelector(
  (state: AppState) => state.cart.items,
  (items) => items.reduce((sum, item) => sum + item.price * item.quantity, 0)
);

function CartBadge() {
  const count = useMeshSelector(selectCartCount);
  return <span>Cart: {count}</span>;
}

function CartTotal() {
  const total = useMeshSelector(selectCartTotal);
  return <strong>Total: {total}</strong>;
}
```

`createSelector` takes one or more input selectors followed by a combiner function. It caches the last result and only recomputes when any input selector returns a new reference.

## Batch Operations

`mesh.batch` groups multiple state mutations into a single subscription notification. This is useful when different subsystems or actions need to update related state without intermediate re-renders or duplicate subscription callbacks:

```ts
// Without batch — two separate notifications
setTheme("dark");
setFontSize(18);

// With batch — one notification, subscribers fire once
mesh.batch(() => {
  setTheme("dark");
  setFontSize(18);
});
```

`mesh.batch` accepts a callback that receives the mesh itself. Mutations inside the callback are coalesced so computed values and subscribers only see the final state:

```ts
mesh.batch((m) => {
  m.setPath("cart.status", "processing");
  m.setPath("cart.error", null);
  m.setPath("ui.checkoutButton", "disabled");
});
```

If the callback throws, no state changes from the batch take effect. `batch` also works with actions and other mesh methods that mutate state.

In React components, use the `useMeshBatch` hook for a stable batch callback:

```tsx
import { useMeshBatch } from "react-statemesh";

function CartUpdate() {
  const batch = useMeshBatch();

  return (
    <button onClick={() => batch(() => {
      mesh.setPath("cart.quantity", 3);
      mesh.setPath("cart.coupon", "SAVE10");
    })}>
      Update
    </button>
  );
}
```

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

Use the `backoff()` helper for exponential retry delays with jitter:

```ts
import { backoff } from "react-statemesh";

mesh.transaction("checkout.submit", {
  retry: {
    attempts: 3,
    delay: backoff({ base: 1000, max: 30000, jitter: true })
  }
});
```

`backoff()` accepts `base` (starting delay), `max` (cap), `factor` (multiplier per attempt, default 2), and `jitter` (randomization).

Add `totalTimeout` to limit the wall-clock time across all retry attempts:

```ts
mesh.transaction("checkout.submit", {
  retry: { attempts: 5, delay: backoff(), totalTimeout: 30000 }
});
```

Add `onRetry` to observe retry attempts for logging or analytics:

```ts
mesh.transaction("checkout.submit", {
  retry: {
    attempts: 3,
    delay: backoff(),
    onRetry: (attempt, error, ctx) => {
      console.warn(`Retry ${attempt}/3 for ${ctx.name}:`, error.message);
    }
  }
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

For high-churn data sources (search results, audit logs, paginated feeds), set `maxCacheEntries` to bound per-resource memory usage. When the cache exceeds the limit, the oldest unused entry is evicted first:

```ts
const auditResource = mesh.resource("audit.log", {
  staleTime: "30s",
  maxCacheEntries: 5,
  key: () => "recent",
  async fetch(_void, ctx) {
    return api.get<AuditPage>("/audit/recent", { signal: ctx.signal });
  }
});
```

Resources support conditional fetching with `enabled`:

```ts
const userResource = mesh.resource("user.profile", {
  enabled: (params, state) => state.auth.token !== null,
  key: () => "current",
  async fetch(_, ctx) {
    return api.get<User>("/me", { signal: ctx.signal });
  }
});
```

When `enabled` returns false, the resource returns cached data without fetching. Accepts a boolean or `(params, state) => boolean`.

Add `onSuccess` and `onError` callbacks for per-resource side effects:

```ts
const productsResource = mesh.resource("products.list", {
  onSuccess: (data, params) => {
    console.log(`Loaded ${data.length} products`);
  },
  onError: (error, params) => {
    mesh.action("ui.showToast")({ message: error.message, severity: "error" });
  },
  // ...
});
```

Cancel an in-flight resource fetch:

```ts
// Via mesh
mesh.cancelResource("products.list", filters);

// Via handle
productsResource.cancel(filters);
```

Check if any resources are currently fetching:

```ts
const count = mesh.isFetching();                        // all fetching resources
const cartCount = mesh.isFetching({ names: ["cart"] }); // filtered by name
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

For smoother search, pagination, and dashboard UIs, the hook can keep previous data visible, provide placeholder data, and select a component-specific shape without rewriting the shared cache:

```tsx
const productNames = useMeshResource(productsResource, filters, {
  keepPreviousData: true,
  placeholderData: [],
  select: (products) => (products ?? []).map((product) => product.name)
});
```

Use React Suspense when route or section boundaries should own initial loading and error UI:

```tsx
import { Suspense } from "react";
import { MeshErrorBoundary, useSuspenseMeshResource } from "react-statemesh";

function Products() {
  const products = useSuspenseMeshResource(productsResource, filters);
  return products.data.map((product) => <div key={product.id}>{product.name}</div>);
}

function ProductsRoute() {
  return (
    <MeshErrorBoundary fallbackRender={({ error, reset }) => (
      <button onClick={reset}>{error.message}: retry</button>
    )}>
      <Suspense fallback={<p>Loading products...</p>}>
        <Products />
      </Suspense>
    </MeshErrorBoundary>
  );
}
```

`useSuspenseMeshResource` throws the shared in-flight resource promise only when no cache data exists. Cached data stays visible during background updates. Failed resources throw to `MeshErrorBoundary`, and its reset callback forces one fresh retry.

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

mesh.persistQueuedMutations({
  key: "shopdesk:mutation-queue",
  storage: "localStorage",
  ttl: "1d"
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

For full app restore, SSR payloads, tests, or migrations, dehydrate and hydrate the whole mesh:

```ts
const snapshot = mesh.dehydrate({
  forms: true
});

mesh.hydrate(snapshot, {
  mergeState: true,
  resources: true,
  queuedMutations: true
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

Relative API bases work naturally in frontend apps. `baseUrl: "/api"` with `api.get("/products")` sends `/api/products`.

Uploads can send `FormData`, `File`, `Blob`, or other browser bodies without forcing JSON, and can report upload progress:

```ts
const formData = new FormData();
formData.append("avatar", file);

await api.upload<User>("/profile/avatar", formData, {
  onUploadProgress(progress) {
    console.log(progress.percent);
  }
});
```

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
}, {
  paramNames: {
    search: "q",
    category: "cat",
    page: "p"
  }
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

Use `paramNames` when the URL should use API/product-friendly names instead of state field names:

```ts
mesh.urlState("products.filters", {
  search: "",
  page: 1,
  sale: false
}, {
  paramNames: {
    search: "q",
    page: "p",
    sale: "available"
  }
});
```

That reads and writes URLs like:

```txt
/products?q=keyboard&p=2&available=true
```

For fully custom naming, use a resolver function:

```ts
mesh.urlState("products.filters", defaults, {
  paramNames: (field) => `filter_${field}`
});
```

`paramNames` takes priority over `paramPrefix`; unmapped fields still fall back to `paramPrefix` or the field name.

Dynamic query params can be captured into one object field when the app supports user-defined filters:

```ts
mesh.urlState("products.filters", {
  search: "",
  params: {} as Record<string, string>
}, {
  paramNames: {
    search: "q"
  },
  captureUnknown: /^filter_/,
  unknownField: "params"
});
```

`/products?q=keyboard&filter_brand=keychron` becomes `{ search: "keyboard", params: { filter_brand: "keychron" } }`.

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
- `form.checkbox("alerts")`, `form.radio("plan", "pro")`, `form.select("country")`, and `form.file("avatar")` return safe props for common input types.
- `form.validateField("email")` runs one sync or async field validator.
- `form.fieldArray("links")` handles append, insert, update, remove, move, and replace for dynamic arrays.
- `form.setServerErrors({ email: "Already taken" })` stores API/server errors separately from client errors.
- `form.resetToServer(serverProfile)` replaces values and uses that payload as the new dirty baseline.
- `form.autosaveNow()` forces an autosave when autosave is configured.
- `form.nextStep()`, `form.previousStep()`, and `form.goToStep("contact")` handle wizard forms.
- `form.isValid` is `true` when there are no errors and no validation is in progress.
- `validateDebounce: 300` on the form definition debounces field-level validation when `validateOnChange` is true.

```tsx
<input type="checkbox" {...form.checkbox("alerts")} />
<input type="radio" {...form.radio("plan", "enterprise")} />
<select {...form.select("country")} />
<input type="file" {...form.file("avatar")} />
```

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

Subscribe to events matching a filter with `mesh.on`:

```ts
// All action events
mesh.on({ type: "action.completed" }, (event) => {
  console.log(`Action ${event.name} completed`);
});

// All resource events (wildcard prefix)
mesh.on({ type: "resource.*" }, (event) => {
  console.log(`Resource event: ${event.type}`);
});

// Specific mutation by name pattern
mesh.on({ type: /mutation\./, name: /^orders\./ }, (event) => {
  console.log(`Order mutation: ${event.type}`);
});
```

Filters accept `type` and `name` fields that match exactly, with a RegExp, or with a `*` wildcard for prefix matching.

Plugins have `name`, `setup`, cleanup, and event access. Duplicate plugin names are rejected.

Middleware and event listeners are observational. Synchronous throws and rejected promises are isolated so analytics, logging, or devtools code cannot break state updates.

Guards are different from middleware: they can intentionally stop an action, transaction, or mutation before it runs.

```ts
const stopGuard = mesh.guard({ kind: "action", name: /^admin\./ }, ({ state }) => ({
  allow: state.user.role === "admin",
  reason: "Admin access is required."
}));
```

When a guard blocks an operation, StateMesh throws `GuardError` before mutating state or starting the API effect.

For development and QA, you can render the in-app DevTools dock:

```tsx
import { MeshComponent, StateMeshDevtools } from "react-statemesh";

function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <MeshComponent name="AppShell">
        <Routes />
      </MeshComponent>
      <StateMeshDevtools
        mesh={mesh}
        mask={["auth.token", "user.email"]}
        previewBytes={2000}
        defaultView="overview"
        theme="light"
      />
    </StateMeshProvider>
  );
}
```

The DevTools UI docks to the bottom of the page, can minimize to a floating launcher, and can maximize into a larger bottom panel. Set `theme="dark"` for a dark-themed panel, or use the built-in toggle button in the header to switch at runtime. It includes tabs for:

- overview health counts
- state snapshot
- action and transaction timeline
- resource cache entries with refetch/invalidate controls
- mutation status and offline queue controls
- form values, errors, dirty fields, touched fields, and step state
- URL state
- tracked React component usage
- profiler samples
- Doctor diagnostics
- raw event timeline with search, category, failed-only filtering, and export

When mounted, DevTools logs a one-time `React StateMesh DevTools active` message to the console with the mesh name and a masking tip. Set `logActiveMessage={false}` when a project wants the dock without the console notice.

`mask` is applied before rendering state/form/url/resource/mutation data or exporting a debug report. Large values are converted into bounded previews with `previewBytes`.

Track the component tree by wrapping important UI areas with `MeshComponent`. StateMesh hooks used inside that boundary are attached to the nearest tracked component:

```tsx
function ProductScreen() {
  return (
    <MeshComponent name="ProductScreen">
      <ProductFilters />
      <ProductList />
    </MeshComponent>
  );
}
```

The Components tab will show the tracked component name, render count, parent id, and captured StateMesh usages such as state paths, selectors, resources, mutations, forms, actions, transactions, URL state, and computed values. For custom instrumentation, call `useMeshComponent("Name")` or `useMeshComponentUsage({ kind: "resource", name: "products.list" })`.

You can also inspect or export the same safe snapshot programmatically:

```ts
const snapshot = mesh.getDevtoolsSnapshot({
  mask: ["auth.token"],
  previewBytes: 4000
});

const unsubscribe = mesh.subscribeDevtools(() => {
  console.log(mesh.getDevtoolsSnapshot().summary);
});
```

The profiler records bounded samples for named actions, transactions, resources, mutations, form submits/autosaves, and computed values:

```ts
const slowOperations = mesh.getProfilerSamples({
  slowOnly: true,
  minDuration: 16
});

mesh.subscribeProfiler(() => {
  console.table(mesh.getProfilerSamples({ limit: 10 }));
});
```

StateMesh Doctor inspects live runtime health without mutating the app:

```ts
const report = mesh.doctor({
  stateSizeWarningBytes: 250_000,
  queuedMutationAgeWarning: "5m",
  staleResourceWarning: "5m",
  slowOperationWarningMs: 16
});
```

Doctor reports large serialized state, resources without invalidation tags, resource errors, long-stale cache entries, stuck offline mutations, unresolved form errors, and slow profiled operations. Reports use stable codes such as `RESOURCE_WITHOUT_TAGS`, `MUTATION_QUEUE_STUCK`, and `OPERATION_SLOW`.

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
- `GuardError`
- `PersistenceError`
- `UrlStateError`
- `FormError`
- `SyncError`

Each error includes `name`, `code`, `cause`, `metadata`, and `timestamp`.

Small helpers are included for UI-safe error handling:

```ts
import { getErrorMessage, getErrorMetadata, getErrorStatus, isApiClientError } from "react-statemesh";

try {
  await products.refetch();
} catch (error) {
  console.error(getErrorMessage(error), getErrorStatus(error), getErrorMetadata(error));
  if (isApiClientError(error) && error.status === 401) {
    redirectToLogin();
  }
}
```

## Router

StateMesh ships a built-in router where **routing IS state management**. Every route transition is a transaction. Every loader is a resource. Every guard is middleware. No other React router reuses the state management primitives this way.

### Route Definitions

```ts
import { defineRoutes } from "react-statemesh/router";

const routes = defineRoutes([
  {
    path: "/",
    component: () => import("./pages/Home"),
    meta: { title: "Home" }
  },
  {
    path: "/products",
    component: () => import("./pages/Products"),
    loader: async ({ mesh, signal }) => {
      return mesh.resource("products.list").fetch({ search: "" }, { signal });
    },
    children: [
      {
        path: ":id",
        component: () => import("./pages/ProductDetail"),
        loader: async ({ params, mesh }) => {
          return mesh.resource("product.detail").fetch({ id: params.id });
        }
      }
    ]
  },
  {
    path: "/checkout",
    component: () => import("./pages/Checkout"),
    meta: { requiresAuth: true },
    pendingComponent: () => import("./pages/CheckoutLoading"),
    errorComponent: () => import("./pages/CheckoutError"),
    rollback: true
  },
  {
    path: "*",
    component: () => import("./pages/NotFound")
  }
]);
```

### Router Registration

```ts
const router = mesh.router(routes, {
  basename: "/app",
  defaultPendingMs: 200,
  defaultPendingMinMs: 300,
  scrollRestoration: true,
  preload: "intent"
});
```

### Provider and Outlet

```tsx
import { RouterProvider, Outlet } from "react-statemesh";

function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <RouterProvider router={router} mesh={mesh} routes={routes}>
        <Layout />
      </RouterProvider>
    </StateMeshProvider>
  );
}

function Layout() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/products">Products</Link>
      </nav>
      <Outlet />
    </div>
  );
}
```

### Navigation

```tsx
import { Link, useNavigate, useMatch, useParams, useSearch } from "react-statemesh";

// Declarative navigation
<Link to="/products/:id" params={{ id: "kbd" }}>Keyboard</Link>
<Link to="/search" search={{ q: "mouse" }}>Search mice</Link>
<Link to="/products" preload>Products (preload on hover)</Link>

// Programmatic navigation
const navigate = useNavigate();
navigate("/checkout");
navigate("/products/:id", { params: { id: "kbd" } });
navigate("/login", { replace: true, search: { returnTo: "/checkout" } });

// Reading route data
const match = useMatch();
const { id } = useParams();
const [search, setSearch] = useSearch();
```

### Route Guards and Middleware

```ts
// Middleware — runs on every navigation, can redirect or block
router.use(async (to, from, next) => {
  analytics.page(to.fullPath);
  return next();
});

// Guards — observational, can redirect
router.beforeEach((to, from, context) => {
  if (to.meta.requiresAuth && !context.mesh.getState().auth.token) {
    throw redirect("/login", { search: { returnTo: to.fullPath } });
  }
});
```

### Navigation Rollback

Routes with `rollback: true` revert the entire navigation if the loader fails. The URL goes back, the user stays on the previous page, and no error page is shown:

```ts
{
  path: "/checkout",
  rollback: true,
  loader: async ({ mesh }) => {
    return mesh.resource("checkout.summary").fetch();
    // If this throws, the URL reverts to the previous route
  }
}
```

### Route Memory Pool (Keep-Alive)

Routes with `keepAlive: true` stay mounted when navigating away. The router maintains a configurable pool with LRU eviction:

```ts
const router = mesh.router(routes, {
  keepAlive: { maxRoutes: 5, evictionStrategy: "lru" }
});

// In the route definition
{ path: "/orders/new", component: OrderForm, keepAlive: true }
```

When the user navigates back to `/orders/new`, the form is instantly visible with all values preserved. No loading spinner, no re-fetch, no form reset.

### Predictive Prefetch

The router learns navigation patterns and speculatively prefetches likely next routes:

```ts
const router = mesh.router(routes, {
  predictivePrefetch: {
    enabled: true,
    topN: 2,
    minProbability: 0.3
  }
});
```

After visiting `/products` → `/products/:id` three times, the fourth visit prefetches the detail route automatically. Navigation becomes instant.

### Automatic Route Analytics

Zero-config page view tracking, time on page, scroll depth, and bounce rate:

```ts
const router = mesh.router(routes, {
  analytics: {
    enabled: true,
    trackPageViews: true,
    trackTimeOnPage: true,
    trackScrollDepth: true,
    onEvent: (event) => analytics.track(event.name, event.properties)
  }
});
```

Events emitted: `route.page_view`, `route.time_on_page`, `route.scroll_depth`, `route.navigation`, `route.bounce`.

### Route Dependencies

Prefetch data in parallel with the main loader:

```ts
{
  path: "/orders/:id",
  loader: async ({ params, mesh }) => mesh.resource("order.detail").fetch({ id: params.id }),
  dependencies: {
    customer: (params, mesh) => mesh.resource("customer.detail").fetch({ id: params.customerId }),
    products: (params, mesh) => mesh.resource("products.list").fetch()
  }
}
```

### Error Recovery with Retry

Routes can auto-retry failed loaders with exponential backoff:

```ts
{
  path: "/dashboard",
  loader: async ({ mesh }) => mesh.resource("dashboard.data").fetch(),
  errorRecovery: {
    retry: 3,
    retryDelay: backoff({ base: 1000, max: 10000 }),
    fallbackComponent: () => import("./DashboardSkeleton")
  }
}
```

### Shared Element Transitions

Animate elements between routes using FLIP (First, Last, Invert, Play):

```tsx
// Product list
<Link to="/products/:id" params={{ id: product.id }}>
  <SharedElement id={`product-image-${product.id}`}>
    <img src={product.image} />
  </SharedElement>
</Link>

// Product detail
<SharedElement id={`product-image-${product.id}`}>
  <img src={product.image} className="hero" />
</SharedElement>
```

### SEO + Meta Management

Declarative meta per route:

```ts
{
  path: "/products/:id",
  loader: async ({ params, mesh }) => mesh.resource("product.detail").fetch({ id: params.id }),
  meta: ({ loaderData }) => ({
    title: `${loaderData.name} | My Store`,
    description: loaderData.description,
    ogImage: loaderData.image
  })
}
```

The router automatically updates `<title>`, `<meta>`, and Open Graph tags on every navigation.

### History Adapters

```ts
import { createBrowserHistory, createMemoryHistory } from "react-statemesh/router";

// Browser history (default in browser environments)
const browserHistory = createBrowserHistory("/app");

// Memory history (for testing and SSR)
const memoryHistory = createMemoryHistory("/", ["/products", "/products/kbd"]);
```

## Testing

```ts
import { createTestMesh, waitForTransactionStatus } from "react-statemesh/testing";

const mesh = createTestMesh({
  state: {
    cart: { items: [], status: "idle", error: null }
  }
});

// Mock actions and transaction effects
mesh.mockAction("cart.addItem", (state, product) => {
  state.cart.items.push(product);
});

mesh.mockTransactionEffect("cart.checkout", async () => {
  throw new Error("Payment failed");
});

// Set resource data directly for tests
mesh.mockResource("products.list", {
  data: [{ id: "1", name: "Keyboard" }],
  params: { search: "" }
});

mesh.assertTransactionStatus("cart.checkout", "error");
mesh.assertStatePath("cart.items", []);

// Async helpers for waiting on async operations
await waitForTransactionStatus(mesh, "cart.checkout", "success", { timeout: 5000 });
await waitForMutationStatus(mesh, "orders.create", "success", { timeout: 5000 });
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
- `examples/realworld-support-desk`
- `examples/production-upgrades`
- `examples/production-observability`
- `examples/login-page`
- `examples/nextjs-app`

The `realworld-support-desk` example is the full production workflow reference. It combines persisted UI state, URL filters, computed state, the API client, resource cache, prefetch, SSR cache hydration, entity helpers, optimistic/offline mutations, invalidation/refetch, production forms, async validation, autosave, field arrays, multi-step form state, tab sync, logger hooks, and in-app devtools.

The `production-upgrades` example focuses on the newer daily-app helpers: resource `keepPreviousData`/`placeholderData`/`select`, relative API bases, URL dynamic param capture, action guards, checkbox/radio/select/file form helpers, and `maxCacheEntries` for bounded resource caches.

The `production-observability` example combines Suspense resources, reset-aware error handling, Doctor diagnostics, the performance profiler, `createSelector` memoized selectors, and `mesh.batch` grouped state updates.

The `login-page` example demonstrates `createApiClient` token injection, `createSelector` for guarded route rendering, `mesh.form` with field validation and server error mapping, `mesh.mutation` for API-backed login, and `mesh.batch` for atomic auth state transitions.

Plain JavaScript React examples:

- `examples-js/basic-counter`
- `examples-js/ecommerce-cart`
- `examples-js/resource-cache`
- `examples-js/checkout-transaction`
- `examples-js/url-filters`
- `examples-js/persisted-cart`
- `examples-js/tab-sync`
- `examples-js/form-submit`
- `examples-js/realworld-support-desk`
- `examples-js/production-upgrades`
- `examples-js/production-observability`
- `examples-js/login-page`
- `examples-js/nextjs-app`

The JavaScript support desk example mirrors the same app shape with `.jsx`, so teams that are not using TypeScript can copy the runtime patterns directly.

## Test Coverage

The library ships with **534 test cases across 16 test files** covering every module, API surface, error path, and edge case.

### Coverage by Module

| Module | Tests | Files | Covers |
|---|---|---|---|
| **Core runtime** | 50 | `store.test.ts` | State reads/writes, subscriptions, guards, dehydration/hydration, profiling |
| **Utils** | 100 | `utils.test.ts` | `clone`, `deepEqual`, `shallowEqual`, `getPath`, `setPath`, `mergeDeep`, `debounce`, `batch`, `backoff`, `splitPath` |
| **Errors** | 131 | `errors.test.ts` | All 16 error classes + 5 helper functions (`getErrorMessage`, `getErrorMetadata`, `getErrorStatus`, `isApiClientError`, `isStateMeshError`) |
| **Sync** | 25 | `sync.test.ts` | `tabSyncPlugin`, `BroadcastChannel` adapter, `localStorage` fallback, message serialization |
| **Persistence** | 35 | `persist.test.ts` | `localStorage`, `sessionStorage`, memory, IndexedDB adapters, TTL, migration, corruption handling |
| **URL state** | 38 | `url.test.ts` | `toQueryParams`, `fromQueryParams`, history adapters, serialization edge cases |
| **DevTools** | 34 | `devtools.test.tsx` | Snapshots, event formatting, masking, logger bridge, devtools bridge |
| **Testing utilities** | 25 | `testing.test.ts` | `createTestMesh`, `createMockMesh`, `mockActions`, assertions, `waitFor*` helpers |
| **Computed** | 15 | `computed.test.ts` | `dependencyIntersects`, `mesh.computed()`, caching, circular reference handling |
| **Router** | 63 | `router.test.ts` | `createBrowserHistory`, `createMemoryHistory`, `updateDocumentMeta`, `defineRoutes`, edge cases |
| **Forms** | 11 | `forms.test.ts` | Form registration, validation, submission, field arrays |
| **Transactions** | 7 | `transactions.test.ts` | Transaction lifecycle, optimistic updates, rollback |
| **Resources** | 15 | `resources.test.ts` | Resource fetch, cache, invalidation, pagination |
| **React hooks** | 35 | `hooks-extended.test.ts` | Mesh API behind hooks: forms, transactions, actions, batch, resources, mutations, computed, router |

### Running Tests

```bash
# Full suite
pnpm test

# Type tests only
pnpm test:types

# Watch mode
pnpm test:watch
```

## Production Notes

- React is a peer dependency.
- Browser APIs are guarded for SSR and Next.js App Router usage.
- Persistence and tab sync are explicit whitelist features.
- Logs do not dump full state by default and can mask sensitive metadata.
- The core has no runtime dependency on Redux, Zustand, Immer, or validation libraries.
- The router uses `window.history` in browser environments and a memory adapter for testing/SSR.
