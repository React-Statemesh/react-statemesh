# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability in StateMesh, report it privately:

1. **Email:** Open a private security advisory on [GitHub](https://github.com/React-Statemesh/react-statemesh/security/advisories/new)
2. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

You should receive an acknowledgement within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Response Timeline

- **48 hours:** Initial acknowledgement of your report
- **7 days:** Assessment of severity and impact
- **30 days:** Fix released for confirmed vulnerabilities (critical issues faster)

## Scope

The following are in scope:

- **Prototype pollution** via `setPath`, persistence deserialization, or cross-tab sync messages
- **Path injection** in API client URLs or router path building
- **State corruption** from malicious sync messages or corrupted persisted data
- **Denial of service** from unbounded memory growth in caches, subscriptions, or undo/redo stacks
- **Cross-site scripting (XSS)** through unsanitized state values rendered by DevTools

The following are out of scope:

- Vulnerabilities in React itself, third-party storage APIs, or browser APIs
- Issues in user application code that uses StateMesh
- Social engineering attacks

## Security Design

StateMesh includes several built-in security measures:

- **Prototype pollution guards.** `parsePath()` rejects `__proto__`, `constructor`, and `prototype` path segments.
- **Sync message validation.** Cross-tab sync validates incoming message keys against a whitelist.
- **Splat encoding.** Router catch-all values are encoded with `encodeURIComponent` to prevent path injection.
- **Path traversal blocking.** API client rejects URLs containing `..` segments.
- **Bounded caches.** Undo/redo stacks, time travel logs, resource caches, and snapshot maps all have configurable size limits.
- **Error isolation.** Middleware, plugin, and event listener errors never break state mutations.
- **SSR guards.** All browser API access is gated behind `isBrowser()` checks.

## Acknowledgements

We publicly acknowledge reporters (with permission) in the release notes for fixed vulnerabilities.
