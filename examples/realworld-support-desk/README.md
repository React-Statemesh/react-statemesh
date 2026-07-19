# Real-World Support Desk Example

This example shows how StateMesh can own a production React workflow instead of only small isolated counters.

It covers:

- persisted UI state for theme and sidebar preferences
- URL-backed ticket filters
- computed open ticket counts from normalized entities
- a central API client with timeout, retry, metadata, and request cancellation
- resource cache reads, request dedupe, prefetch, invalidation, active refetch, dehydration, and hydration
- entity helpers for normalizing server records into mesh state
- optimistic status changes with rollback-ready mutation state
- offline mutation queueing and manual queue flush
- production form handling with schema validation, async field validation, server error mapping, autosave, field arrays, dirty tracking, reset, and multi-step navigation
- tab sync, logger plugin wiring, and `StateMeshDevtools`

The example is intentionally split between `src/state.ts` and `src/App.tsx` so real apps can keep mesh setup, resources, mutations, and forms outside React components.

The behavior is tested in `tests/examples/realworld-support-desk.test.tsx`.
