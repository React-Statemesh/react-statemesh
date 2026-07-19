import { StateMeshError } from "../errors/StateMeshError";

/** Path value accepted by StateMesh path helpers. */
export type Path = string | readonly (string | number)[];

// Cache of parsed path segments keyed by the original path string.
// Uses LRU eviction: oldest entry removed when capacity is reached.
const pathCache = new Map<string, ReadonlyArray<string | number>>();
const PATH_CACHE_MAX = 1_000;

// Dangerous path segments that could cause prototype pollution.
const DANGEROUS_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/** Reject path segments that could cause prototype pollution. */
function validatePathSegments(parts: Array<string | number>): void {
  for (const part of parts) {
    if (typeof part === "string" && DANGEROUS_SEGMENTS.has(part)) {
      throw new StateMeshError(
        `Refusing to traverse dangerous path segment: "${part}". ` +
        `Path segments "__proto__", "constructor", and "prototype" are blocked to prevent prototype pollution.`,
        {
          code: "STATEMESH_DANGEROUS_PATH",
          metadata: { segment: part }
        }
      );
    }
  }
}

/** Convert a dot path or array path into normalized path segments. */
export function parsePath(path: Path): ReadonlyArray<string | number> {
  if (typeof path !== "string") {
    const arr = [...path];
    validatePathSegments(arr);
    return arr;
  }
  if (path.trim() === "") return [];

  const cached = pathCache.get(path);
  if (cached) return cached;

  const parts = path.split(".").map((part: string) => {
    const numeric = Number(part);
    return Number.isInteger(numeric) && part.trim() !== "" && String(numeric) === part ? numeric : part;
  });

  validatePathSegments(parts);

  // LRU: delete and re-insert to move to end (most recently used)
  if (pathCache.size >= PATH_CACHE_MAX) {
    const oldest = pathCache.keys().next().value;
    if (oldest !== undefined) pathCache.delete(oldest);
  }
  const frozen = Object.freeze(parts);
  pathCache.set(path, frozen);

  return frozen;
}

/** Read a nested value by path. Returns `undefined` when any segment is missing. */
export function getPath<TValue = unknown>(source: unknown, path: Path): TValue {
  const parts = parsePath(path);
  let current = source;

  for (const part of parts) {
    if (current == null) return undefined as TValue;
    current = (current as Record<string | number, unknown>)[part];
  }

  return current as TValue;
}

/** Return a copy of `source` with one nested path updated. */
export function setPath<TState>(source: TState, path: Path, value: unknown): TState {
  const parts = parsePath(path);
  if (parts.length === 0) return value as TState;

  const cloneRoot = Array.isArray(source)
    ? ([...(source as unknown[])] as unknown)
    : ({ ...(source as Record<string, unknown>) } as unknown);
  let cursor = cloneRoot as Record<string | number, unknown>;
  let originalCursor = source as Record<string | number, unknown>;

  parts.forEach((part, index) => {
    const isLast = index === parts.length - 1;
    if (isLast) {
      cursor[part] = value;
      return;
    }

    const nextPart = parts[index + 1];
    const originalNext = originalCursor?.[part];
    const clonedNext = Array.isArray(originalNext)
      ? [...originalNext]
      : originalNext != null && typeof originalNext === "object"
        ? { ...(originalNext as Record<string, unknown>) }
        : typeof nextPart === "number"
          ? []
          : {};

    cursor[part] = clonedNext;
    cursor = clonedNext as Record<string | number, unknown>;
    originalCursor = (originalNext ?? {}) as Record<string | number, unknown>;
  });

  return cloneRoot as TState;
}

/** Pick multiple paths from an object into a `{ path: value }` record. */
export function pickPaths(source: unknown, paths: readonly string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const path of paths) {
    picked[path] = getPath(source, path);
  }
  return picked;
}

/** Apply a `{ path: value }` record onto state using structural path updates. */
export function applyPathMap<TState>(state: TState, values: Record<string, unknown>): TState {
  let next = state;
  for (const [path, value] of Object.entries(values)) {
    next = setPath(next, path, value);
  }
  return next;
}
