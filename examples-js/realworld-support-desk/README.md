# Real-World Support Desk JavaScript Example

This is the plain React JavaScript mirror of `examples/realworld-support-desk`.

It demonstrates that StateMesh is TypeScript-first, not TypeScript-only. JavaScript apps can use the same mesh, resource, mutation, form, API client, and devtools APIs from `.jsx` components.

It covers:

- central API client setup
- cached ticket resources
- mutations with invalidation
- production form state with schema validation, async validation, autosave, and field arrays
- persisted UI state
- in-app `StateMeshDevtools`

The JavaScript app is rendered by `tests/examples/realworld-support-desk.test.tsx` so the JSX example stays copy-paste safe.
