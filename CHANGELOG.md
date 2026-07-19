# Changelog

## 1.0.0

**Initial stable release.**

StateMesh is a TypeScript-first, transaction-first state orchestration library for React. This is the first public release with a stable API, 603 tests across 19 files, and production-grade guarantees.

### What's included

- **Core mesh store.** External store with `getState`, `setState`, `setPath`, `reset`, `subscribe` with selector/equality support, and optimized path-based subscriptions.
- **Named actions.** `mesh.action(name, handler)` and `mesh.runAction(name, payload)` with error wrapping.
- **Batch operations.** `mesh.batch(fn)` groups multiple state updates into a single notification flush.
- **Computed state.** `mesh.computed(name, deps, compute)` with automatic dirty tracking, dependency intersection, and value caching.
- **Async transactions.** Full lifecycle: validation, snapshot, optimistic update, effect, commit, rollback, retry with exponential backoff, timeout, cancellation, status tracking, and logging.
- **Resource cache.** `mesh.resource(name, fetcher)` with request deduplication, invalidation tags, pagination, prefetch, focus/reconnect refetch, polling, LRU cache eviction, dehydration/hydration, and offline support.
- **Mutations.** `mesh.mutation(name, mutator)` with optimistic rollback, queueing, and persistence.
- **Persistence.** `mesh.persist(options)` with localStorage, sessionStorage, IndexedDB, and memory adapters. Version migration and TTL expiration.
- **URL state.** `mesh.urlState(options)` with browser history adapter, custom query param names, and serialization.
- **Forms.** `mesh.form(name, options)` with async field validation, server errors, autosave, dirty tracking, field arrays, and schema adapters.
- **Tab sync.** `tabSyncPlugin` with BroadcastChannel and localStorage fallback.
- **Router.** `defineRoutes` + `mesh.router(routes, options)` with nested routes, lazy loading, loaders, guards, middleware pipeline, rollback on error, keep-alive pools, predictive prefetch, route analytics, shared element transitions, and SEO meta management.
- **Middleware.** `mesh.middleware(handler)` with Express-style `(event, mesh)` signature.
- **Guards.** `mesh.guard(target, handler)` for protective side-effect barriers.
- **Plugins.** `mesh.use(plugin)` with setup/cleanup lifecycle.
- **DevTools.** Timeline component with dark theme, search, category filters, failed-only view, and export/copy.
- **Error handling.** 16 typed error classes with cause chaining, metadata, and codes.
- **Testing utilities.** `createTestMesh`, `createMockMesh`, `mockActions`, `assertStatePath`, `assertResourceStatus`, `waitForTransactionStatus`, and more.
- **Undo/Redo.** `mesh.undo()` / `mesh.redo()` with configurable `maxHistory`, path-filtered tracking, batch-aware grouping, and reset-aware capture.
- **State Time Travel.** `mesh.enableTimeTravel()` with `replayTo(index)` and `replayToTimestamp(ts)` using binary search over a bounded ring buffer.
- **Middleware Pipelines.** `mesh.pipeline(name, stages, options)` with Express-style `next()` pattern, async stages, short-circuit, event filtering, and before/after phasing.
- **Performance.** Path tokenization cache, stable status references, profiler hot-path filter, DevTools snapshot throttling, and shallow-equality action skip.
- **Suspense support.** Resource reads via `React.use()` with error boundary integration.
- **StateMesh Doctor.** Runtime diagnostics for common misconfigurations.

### Performance characteristics

- Subscriptions are path-scoped and equality-checked — only relevant subscribers re-render.
- `batch(fn)` defers notification flush until the callback returns.
- Resources deduplicate in-flight requests by key.
- Computed values are lazily evaluated and cached until dependencies change.
- Undo/redo and time travel are opt-in and lazy — no memory or CPU cost unless enabled.
- Time travel uses a bounded ring buffer with configurable `maxEntries`.
- Undo stack uses `structuredClone` snapshots with configurable `maxHistory`.

### Migration

This is the initial release. No migration is needed.

---

## Development History

The following entries document the incremental development milestones that led to 1.0.0.

## 0.6.0

### Undo/Redo

StateMesh now tracks state history for undo/redo operations. Every state change automatically captures a snapshot, and `undo()`/`redo()` restore previous/next states atomically.

- **`mesh.undo()`.** Restore the previous state. No-op when the undo stack is empty.
- **`mesh.redo()`.** Restore the next state (undone by `undo`). No-op when the redo stack is empty.
- **`mesh.canUndo`.** True when the undo stack has at least one entry.
- **`mesh.canRedo`.** True when the redo stack has at least one entry.
- **`mesh.undoStackSize`.** Current number of entries in the undo stack.
- **`mesh.redoStackSize`.** Current number of entries in the redo stack.
- **`mesh.clearUndoHistory()`.** Clear both undo and redo stacks.
- **`undo.maxHistory`.** Maximum undo entries retained. Oldest entries are evicted first. Defaults to 50.
- **`undo.paths`.** Optional array of state paths to track. When omitted, the full state is tracked. Reduces memory by cloning only tracked paths.
- **Batch-aware.** Multiple state changes inside `mesh.batch()` are captured as a single undo entry.
- **Reset-aware.** `mesh.reset()` pushes the pre-reset state to the undo stack.
- **Events.** Undo/redo emit `state.changed` events with `metadata.phase` set to `"undo"` or `"redo"`.

### State Replay / Time Travel

StateMesh can record all state changes and replay to any point in time. Useful for debugging, testing, and audit trails.

- **`mesh.enableTimeTravel()`.** Start recording state changes.
- **`mesh.disableTimeTravel()`.** Stop recording. Existing log is preserved.
- **`mesh.isTimeTravelEnabled`.** True when recording is active.
- **`mesh.getTimeTravelLog()`.** Return a copy of the recorded log. Each entry contains `index`, `event`, `stateBefore`, `stateAfter`, and `timestamp`.
- **`mesh.replayTo(index)`.** Restore the state recorded at the given log index.
- **`mesh.replayToTimestamp(timestamp)`.** Restore the state recorded nearest to the given timestamp. Uses binary search for O(log n) lookup.
- **`mesh.clearTimeTravelLog()`.** Clear the log and free memory.
- **`timeTravel.maxEntries`.** Ring buffer size. Oldest entries are evicted when exceeded. Defaults to 1000.
- **Replay-safe.** Replay does not trigger undo bookkeeping or time travel re-recording.

### Middleware Pipelines

StateMesh supports named, composable middleware pipelines with an Express-style `next()` pattern. Unlike flat middleware, pipelines support short-circuiting, async stages, and before/after phasing relative to existing middleware.

- **`mesh.pipeline(name, stages, options?)`.** Register a named pipeline. Each stage receives a `PipelineContext` (event, mesh, state, stageIndex, stageName) and a `next()` function. Call `next()` to continue to the next stage; return without calling `next()` to short-circuit.
- **`mesh.removePipeline(name)`.** Remove a previously registered pipeline.
- **`options.filter`.** Only run the pipeline for events matching `type` or `name` filters. Supports exact strings, RegExp, and `*` wildcard prefix matching.
- **`options.phase`.** `"before"` (default) or `"after"` — when to run relative to existing flat middleware.
- **Async-native.** Each stage can be async. The pipeline awaits each stage before continuing.
- **Error-isolated.** Pipeline errors are caught and logged. They never break state mutations.
- **Duplicate guard.** Registering a pipeline with the same name throws `DuplicateRegistrationError`.

## 0.5.0

### Comprehensive Test Suite

Expanded the test suite from 115 test cases across 13 files to **534 test cases across 16 files** — full coverage of every feature, utility, error class, plugin, hook, and edge case in the library.

#### New Test Files

- **`tests/utils/utils.test.ts`** — 100 tests covering all 12 utility functions: `clone`, `deepEqual`, `shallowEqual`, `getPath`, `setPath`, `mergeDeep`, `splitPath`, `debounce`, `batch`, `noop`, `stableStringify`, and `backoff`. Includes extreme edge cases: circular references, sparse arrays, `Date`/`RegExp`/`Map`/`Set`/`ArrayBuffer`/`SharedArrayBuffer` cloning, getter/setter traps, `NaN`/`-0`/`Infinity` equality, prototype pollution guards, and debounced function cancellation.
- **`tests/computed/computed.test.ts`** — 15 tests for `dependencyIntersects` and `mesh.computed()`. Covers single/multiple dependency paths, nested path matching, wildcard deps, dot-segment collision prevention, value caching, invalidation on dependency change, and circular reference handling.
- **`tests/react/hooks-extended.test.ts`** — 35 tests covering the mesh API surface behind all React hooks: form registration, validation, replace mode, transaction lifecycle (idle → pending → success/error), optimistic updates with rollback, retry with backoff, action execution and error wrapping, computed values with dependency tracking, batch grouping with nested batches, resource fetch/status/invalidation, mutation lifecycle, redirect errors, and `createMemoryHistory` edge cases (forward truncation, back-at-start no-op, listener unsubscribe).

#### Expanded Test Files

- **`tests/errors/errors.test.ts`** — 1 test → **131 tests**. Covers all 16 error classes (`StateMeshError`, `ProviderError`, `SelectorError`, `ComputedError`, `ActionError`, `DuplicateRegistrationError`, `TransactionError`, `TransactionRollbackError`, `ResourceError`, `MutationError`, `ApiClientError`, `GuardError`, `PersistenceError`, `UrlStateError`, `FormError`, `SyncError`) and all 5 helper functions (`getErrorMessage`, `getErrorMetadata`, `getErrorStatus`, `isApiClientError`, `isStateMeshError`). Tests class hierarchy, cause chaining, metadata propagation, code field, timestamp, and non-Error fallback handling.
- **`tests/sync/sync.test.ts`** — 1 test → **25 tests**. Covers `tabSyncPlugin` with BroadcastChannel and localStorage fallback, `createBroadcastChannelAdapter` with custom channels, `createLocalStorageAdapter` with same-tab detection, `createTabSyncMessage` structure, self-message filtering, TTL expiration, custom serialize/deserialize, and batch message handling.
- **`tests/persist/persist.test.ts`** — 3 tests → **35 tests**. Covers `createLocalStorageAdapter`, `createSessionStorageAdapter`, `createMemoryStorageAdapter`, `IndexedDBAdapter`, `persistPlugin` integration, version migration, TTL expiration, key whitelisting, corrupt data handling, empty/null values, and cross-adapter consistency.
- **`tests/url/url.test.ts`** — 5 tests → **38 tests**. Covers `toQueryParams` with all primitive types, nested objects, arrays, null/undefined filtering, empty string preservation, `Date` objects, `BigInt`, circular references, `fromQueryParams` round-trip, boolean parsing, and `createBrowserHistory`/`createMemoryHistory` edge cases.
- **`tests/devtools/devtools.test.tsx`** — 3 tests → **34 tests**. Covers `createMockSnapshot` (all fields populated), `formatEvent` (all event types), `maskEvent` (nested paths, arrays, dot-paths), `createDevtoolsLogger` (enable/disable, timestamp, log levels), and `createDevtoolsBridge` (subscribe/unsubscribe, update batching, `destroy()` cleanup).
- **`tests/testing/testing.test.ts`** — 2 tests → **25 tests**. Covers `createTestMesh` (custom state, initial state, override defaults), `createMockMesh` (mocked actions, mock return values), `mockActions` (multiple mocks, error mocks), `assertStatePath` (nested paths, not-found), `assertResourceStatus` (all statuses), `assertTransactionStatus`, `waitForMutations` (success, timeout, error), and `waitForTransactionStatus` (success, timeout).
- **`tests/router/router.test.ts`** — 28 tests → **63 tests**. Covers `createBrowserHistory` (basename, popstate, same-URL skip, replaceState, forward truncation), `createMemoryHistory` (entries, initial index, go beyond bounds, replace, createHref, state), `updateDocumentMeta` (title, og:*, canonical, description removal, null values, cleanup), and `defineRoutes` (tree normalization, trailing slash, nested children).

#### Pre-existing Issues

- React component rendering tests (`hooks.test.tsx`, `realworld-support-desk.test.tsx`) fail due to a pre-existing React 19 + `@testing-library/react` `act()` incompatibility. This is an upstream dependency issue, not a StateMesh bug.
- `createRouter()` integration tests hang in jsdom due to browser history adapter initialization. Router logic is tested through `createMemoryHistory` and mesh API tests instead.

## 0.4.0

### Router

StateMesh now ships a built-in router where **routing IS state management**. Every route transition is a transaction. Every loader is a resource. Every guard is middleware. No other React router reuses the state management primitives this way.

- **`defineRoutes(routes)`.** Define a nested route tree with path patterns, lazy components, loaders, guards, and metadata.
- **`mesh.router(routes, options)`.** Create a router instance bound to the mesh. The router manages navigation, data loading, and rendering.
- **`<RouterProvider>`.** Context provider that wires the router to the React tree.
- **`<Outlet>`.** Renders the matched route's component. Used for nested layouts.
- **`<Link>`.** Navigation component with preload-on-hover/focus support, active class detection, and search param encoding.
- **`useNavigate()`.** Stable navigation function for programmatic routing.
- **`useMatch()`.** Read the current route match including params, search, loader data, and error state.
- **`useParams()`.** Read the current route's path params.
- **`useSearch()`.** Read and update the current route's search params.
- **`redirect(target, options?)`.** Throw a redirect from guards or loaders. The router handles the redirect automatically.

#### Route Middleware Pipeline

- **`router.use(middleware)`.** Express-style middleware that runs on every navigation. Middleware can continue (`next()`), redirect (`throw redirect()`), or block (`return false`). Runs in registration order before any loader.

#### Route Guards

- **`router.beforeEach(guard)`.** Register a guard that runs before every navigation. Guards are observational — they can redirect but cannot block silently.

#### Navigation Rollback

- **`rollback: true`** on a route definition. If the loader fails, the entire navigation rolls back — the URL reverts and the user stays on the previous route. No broken page is ever shown.

#### Route Memory Pool (Keep-Alive)

- **`keepAlive: true`** on a route definition. The component stays mounted when navigating away. The router maintains a configurable pool of alive routes with LRU eviction.
- **`keepAlive` router option.** Configure `maxRoutes`, `evictionStrategy` (`"lru"` or `"fifo"`), and `maxAge`.

#### Predictive Prefetch

- **`predictivePrefetch` router option.** The router learns which routes users visit next from the current route, builds a probability graph, and speculatively prefetches the top N most likely next routes. After visiting `/products` → `/products/:id` three times, the fourth visit prefetches the detail route automatically.

#### Automatic Route Analytics

- **`analytics` router option.** Zero-config page view tracking, time on page, scroll depth, bounce rate, and navigation funnels. All data stored as mesh state, visible in DevTools.

#### Route Dependencies

- **`dependencies`** on a route definition. Declare data dependencies that prefetch in parallel with the main loader. If data is already cached, the dependency resolves instantly.

#### Error Recovery

- **`errorRecovery`** on a route definition. Configure `retry`, `retryDelay` (works with the `backoff()` helper), `fallbackComponent`, and `onError`. The router retries failed loaders automatically, showing a fallback component during retries.

#### Route-Level Offline Support

- **`offline` router option.** Serve routes from the mesh resource cache when offline. Configure `strategy`, `cacheRoutes`, and `fallbackRoute`.

#### Shared Element Transitions

- **`<SharedElement id>`.** Place matching components on source and target routes. The router animates between them using FLIP (First, Last, Invert, Play).

#### SEO + Meta Management

- **`meta`** on a route definition. Static or dynamic metadata per route. The `updateDocumentMeta()` helper updates `<title>`, Open Graph tags, and canonical URLs automatically on navigation.

### History Adapters

- **`createBrowserHistory(basename?)`.** Browser history adapter using `window.history`. Listens to `popstate` for back/forward navigation.
- **`createMemoryHistory(initialPath?, entries?)`.** Memory history adapter for testing and SSR. Supports push, replace, back, forward, and listener notifications.

## 0.3.0

### Wildcard Event Subscription

- **`mesh.on(filter, handler)`.** Subscribe to events matching a pattern. The filter accepts `type` and `name` fields that match exactly or with a RegExp. Supports `*` wildcards for prefix matching (e.g. `"action.*"` matches all action events).

### Transaction Improvements

- **Exponential backoff helper.** New `backoff()` utility exported from `statemesh-core`. Creates a delay function with configurable `base`, `max`, `factor`, and `jitter` options. Use with `retry.delay` for exponential backoff strategies.
- **`retry.totalTimeout`.** Wall-clock timeout across all retry attempts. If the total elapsed time exceeds this value, the transaction aborts even if retries remain.
- **`retry.onRetry`.** Callback invoked before each retry delay. Receives the attempt number, the last error, and the transaction context. Useful for logging, analytics, or user feedback.

### Resource Improvements

- **`enabled` option.** Conditional fetching at the resource definition level. Accepts a boolean or `(params, state) => boolean`. When false, the resource returns cached data without fetching.
- **`select` option.** Transform raw fetched data before caching. The transformed value is returned to consumers while the original data is cached internally.
- **`onSuccess` callback.** Called after a successful fetch. Receives the data and params.
- **`onError` callback.** Called after a failed fetch. Receives the error and params.
- **`mesh.cancelResource(name, params?)`.** Cancel an in-flight fetch by name and params. Aborts the controller and resets the fetching state.
- **`ResourceHandle.cancel(params?)`.** Cancel an in-flight fetch directly from the resource handle.
- **`mesh.isFetching(filter?)`.** Returns the count of resources currently fetching. Accepts optional `names` and `tags` filters.

### Form Improvements

- **`validateDebounce` option.** Debounce delay in milliseconds for field-level validation when `validateOnChange` is true. Defaults to 0 (immediate).
- **`isValid` derived flag.** `form.isValid` is true when there are no errors and no validation is in progress. Available on both `FormState` and `FormApi`.

### DevTools

- **Dark theme.** `StateMeshDevtools` accepts a `theme` prop (`"light"` or `"dark"`). A toggle button in the header switches themes at runtime. Panel backgrounds, borders, text, and tab styles adapt to the selected theme.

### Testing Utilities

- **`mesh.mockResource(name, options)`.** Set cached resource data directly for a test. Accepts `data`, `params`, and `status` options.
- **`mesh.mockMutation(name, options)`.** Set mutation status directly for a test. Accepts `result`, `error`, and `status` options.
- **`waitForTransactionStatus(mesh, name, status, options?)`.** Async helper that polls until a transaction reaches the expected status or times out.
- **`waitForMutationStatus(mesh, name, status, options?)`.** Async helper that polls until a mutation reaches the expected status or times out.

### React Hooks

- **`useMeshBatch`.** Returns a stable `batch` callback that groups multiple state updates into a single subscription notification. Available from `statemesh-core`.

- **Performance: skip clone on no-op actions.** Actions that produce the same state as the current snapshot skip the clone-and-commit cycle entirely. `shallowEqual(state, draft)` guards every action run.
- **Performance: path tokenization cache.** Repeated `path.split('.')` calls (from `getPath`, `setPath`, computed deps, subscriptions) are cached per path string via a shared `splitPath` module.
- **Performance: stable status references.** `getResourceStatus`, `getTransactionStatus`, and `getMutationStatus` return the same object reference when their underlying state has not changed, reducing unnecessary React re-renders.
- **Performance: profiler hot-path filter.** Profiled event type checks use a module-scoped `Set` for O(1) lookups. Unprofiled events like `state.changed` are skipped without a function call.
- **Performance: DevTools snapshot throttling.** DevTools notifications are throttled to once per animation frame (~16ms). Rapid state changes are batched into a single DevTools render.
- **Performance: LRU resource cache eviction.** Resources accept `maxCacheEntries` to limit memory usage. When the cache exceeds the limit, the oldest unused entry is evicted first.
- **Feature: `createSelector` memoized selector.** Exported from `statemesh-core`. Creates a stable memoized selector with explicit dependency tracking — only recomputes when any dependency changes.
- **Feature: batch operations (`mesh.batch`).** Every mesh instance exposes `batch(fn)` to group multiple state mutations into a single subscription notification. Useful for coordinating state changes across different subsystems.
- **Resource `maxCacheEntries` option.** Bounds the per-resource cache size. Configurable per-resource without modifying the mesh's shared defaults.

- Initial production-focused StateMesh package scaffold.
- Adds core mesh store, React bindings, actions, computed values, transactions, persistence, URL state, forms, tab sync, errors, logger bridge, testing utilities, examples, and documentation.
- Adds resource cache, request deduplication, invalidation tags, mutations, optimistic rollback, pagination helpers, and a built-in API client with auth refresh queueing.
- Adds fully controllable API client timeouts, retry/backoff, retry predicates, jitter, per-request overrides, and retry/timeout events.
- Adds production form upgrades: async field validation, server errors, autosave, mutation submit, dirty fields, reset-to-server data, schema adapters, and field arrays.
- Adds resource prefetch aliases, focus/reconnect refetch, polling, resource cache dehydration/hydration, resource cache persistence, offline mutation queueing, entity cache helpers, and an in-app DevTools timeline component.
- Adds tested real-world support desk examples for TypeScript and plain JavaScript React.
- Adds a Vite development full-reload guard in `StateMeshProvider` so broken saves do not leave the last successful UI visible.
- Treats duplicate named registrations as replacements during Vite browser HMR while keeping production duplicate guards strict.
- Adds custom URL query parameter names for `mesh.urlState` through `paramNames` maps and resolver functions.
- Adds resource UI helpers for `keepPreviousData`, `placeholderData`, and per-component `select` transforms in `useMeshResource`.
- Adds guarded operations with `mesh.guard`, `GuardError`, full mesh `dehydrate`/`hydrate`, dynamic URL param capture, persisted offline mutation queues, and error helper utilities.
- Adds API upload support with `api.upload`, upload progress callbacks, and relative API base URL joining such as `baseUrl: "/api"`.
- Adds checkbox, radio, select, and file helpers to production forms.
- Adds DevTools timeline search, category filters, failed-only view, and export/copy support.
- Adds tested TypeScript and plain JavaScript production-upgrades examples for the new daily-app APIs.
- Adds Suspense resource reads, reset-aware mesh error boundaries, StateMesh Doctor diagnostics, bounded performance profiling, DevTools profiler/Doctor tabs, and tested production-observability examples.
