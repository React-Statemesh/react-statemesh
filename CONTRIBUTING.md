# Contributing to StateMesh

Thanks for your interest in contributing to StateMesh. This document covers the development setup, coding standards, and workflow for submitting changes.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/React-Statemesh/react-statemesh.git
cd react-statemesh

# Install dependencies (pnpm is required)
pnpm install

# Run the full test suite
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type-check the source
pnpm typecheck

# Run type tests
pnpm test:types

# Build the package
pnpm build
```

**Requirements:** Node.js >= 18, pnpm >= 9.

## Project Structure

```
src/
  core/          # createMesh, types, batcher, tab-sync internals
  react/         # All React hooks and providers
  router/        # Built-in router, history adapters, route matching
  resources/     # Resource cache, API client, mutations
  persist/       # Storage adapters and persistence plugin
  sync/          # Cross-tab sync plugin and transports
  forms/         # Form registration, validation, field state
  devtools/      # DevTools components, logger, bridge
  testing/       # Test helpers and mock utilities
  errors/        # All error classes and helpers
  utils/         # Shared utilities (clone, path, equality, debounce)
  url/           # URL state management
  computed/      # Computed value internals
  transactions/  # Transaction runner internals
tests/           # Test files mirroring src/ structure
test-d/          # Type-level tests (tsd)
examples/        # TypeScript React examples
examples-js/     # Plain JavaScript React examples
```

## Coding Standards

- **TypeScript strict mode.** All source code passes `tsc --noEmit` with zero errors in `src/`.
- **No runtime dependencies.** The library has zero production dependencies. React is a peer dependency.
- **JSDoc on all exports.** Every exported type, function, class, and hook must have a `/** ... */` comment with a description and `@example` where helpful.
- **Consistent naming.** Functions use camelCase, types/interfaces use PascalCase, error codes use SCREAMING_SNAKE_CASE with a `STATEMESH_` prefix.
- **Error isolation.** Middleware, plugin, and event listener errors must never break state mutations. Use `catchAsyncError` for fire-and-forget side effects.
- **SSR safety.** All browser API access (`window`, `document`, `localStorage`) must be guarded with `typeof` checks or `isBrowser()`.

## Writing Tests

- Every new feature needs tests in the corresponding `tests/` file.
- Every bug fix needs a regression test that fails before the fix and passes after.
- Tests use Vitest. Run `pnpm test` to execute the full suite.
- Type-level tests go in `test-d/` and use `tsd`. Run `pnpm test:types` to check them.
- Aim for edge cases: empty inputs, `null`/`undefined`, circular references, concurrent operations, and error paths.

## Submitting Changes

1. **Fork the repo** and create a branch from `master`:
   ```bash
   git checkout -b feature/my-feature master
   ```

2. **Make your changes** following the coding standards above.

3. **Run all checks** before submitting:
   ```bash
   pnpm typecheck
   pnpm test
   pnpm test:types
   pnpm build
   ```

4. **Commit with a clear message** describing what changed and why:
   ```
   Add TTL support to IndexedDB persistence adapter

   IndexedDB adapter now respects the ttl option by storing an expiry
   timestamp alongside each entry and checking it on read.
   ```

5. **Open a pull request** against `master` with:
   - A description of what the PR does and why
   - A reference to any related issue (`Fixes #123`)
   - Screenshots or recordings for UI-facing changes (DevTools, error boundaries)

## Pull Request Checklist

- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm test` passes (all 603+ tests)
- [ ] `pnpm test:types` passes
- [ ] `pnpm build` produces all entry points
- [ ] New exports have JSDoc comments
- [ ] Breaking changes are documented in CHANGELOG.md

## Reporting Bugs

Use the [bug report template](https://github.com/React-Statemesh/react-statemesh/issues/new?template=bug_report.md). Include:

- StateMesh version
- React version
- A minimal reproduction (CodeSandbox, StackBlitz, or a small repo)
- Expected vs actual behavior
- Console errors or stack traces

## Requesting Features

Use the [feature request template](https://github.com/React-Statemesh/react-statemesh/issues/new?template=feature_request.md). Describe:

- The problem you're trying to solve
- How you'd use the feature in your app
- Any alternatives you've considered

## Security Vulnerabilities

See [SECURITY.md](./SECURITY.md) for the vulnerability reporting policy. **Do not open public issues for security vulnerabilities.**

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
