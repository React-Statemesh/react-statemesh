# Changelog

## 0.3.0

### Wildcard Event Subscription

- **`mesh.on(filter, handler)`.** Subscribe to events matching a pattern. The filter accepts `type` and `name` fields that match exactly or with a RegExp. Supports `*` wildcards for prefix matching (e.g. `"action.*"` matches all action events).

### Transaction Improvements

- **Exponential backoff helper.** New `backoff()` utility exported from `react-statemesh`. Creates a delay function with configurable `base`, `max`, `factor`, and `jitter` options. Use with `retry.delay` for exponential backoff strategies.
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

- **`useMeshBatch`.** Returns a stable `batch` callback that groups multiple state updates into a single notification flush. Available from `react-statemesh`.

- **Performance: skip clone on no-op actions.** Actions that produce the same state as the current snapshot skip the clone-and-commit cycle entirely. `shallowEqual(state, draft)` guards every action run.
- **Performance: path tokenization cache.** Repeated `path.split('.')` calls (from `getPath`, `setPath`, computed deps, subscriptions) are cached per path string via a shared `splitPath` module.
- **Performance: stable status references.** `getResourceStatus`, `getTransactionStatus`, and `getMutationStatus` return the same object reference when their underlying state has not changed, reducing unnecessary React re-renders.
- **Performance: profiler hot-path filter.** Profiled event type checks use a module-scoped `Set` for O(1) lookups. Unprofiled events like `state.changed` are skipped without a function call.
- **Performance: DevTools snapshot throttling.** DevTools notifications are throttled to once per animation frame (~16ms). Rapid state changes are batched into a single DevTools render.
- **Performance: LRU resource cache eviction.** Resources accept `maxCacheEntries` to limit memory usage. When the cache exceeds the limit, the oldest unused entry is evicted first.
- **Feature: `createSelector` memoized selector.** Exported from `react-statemesh`. Creates a stable memoized selector with explicit dependency tracking — only recomputes when any dependency changes.
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
