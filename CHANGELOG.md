# Changelog

## 0.1.0

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
