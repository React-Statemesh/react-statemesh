import type { RouteDefinition, RouteMatch } from "./types";

/** Compiled route pattern with param extraction. */
type CompiledPattern = {
  /** Original pattern string. */
  pattern: string;
  /** Regex for matching. */
  regex: RegExp;
  /** Ordered param names extracted from the pattern. */
  paramNames: string[];
  /** Whether this is a catch-all pattern. */
  isCatchAll: boolean;
};

const patternCache = new Map<string, CompiledPattern>();

/**
 * Compile a path pattern into a regex.
 *
 * Supports:
 * - Static segments: `/products`
 * - Dynamic params: `/products/:id`
 * - Catch-all: `*` or `*splat`
 */
export function compilePattern(pattern: string): CompiledPattern {
  const cached = patternCache.get(pattern);
  if (cached) return cached;

  const paramNames: string[] = [];
  let regexStr = "";
  let isCatchAll = false;
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === ":") {
      // Dynamic param — read until next / or end
      let name = "";
      i += 1;
      while (i < pattern.length && pattern[i] !== "/" && pattern[i] !== "*") {
        name += pattern[i];
        i += 1;
      }
      paramNames.push(name);
      regexStr += "([^/]+)";
    } else if (ch === "*") {
      // Catch-all
      isCatchAll = true;
      let name = "";
      i += 1;
      while (i < pattern.length && pattern[i] !== "/") {
        name += pattern[i];
        i += 1;
      }
      paramNames.push(name || "splat");
      regexStr += "(.*)";
    } else {
      // Static segment — escape regex special chars
      if (ch === "." || ch === "+" || ch === "?" || ch === "(" || ch === ")" || ch === "[" || ch === "]" || ch === "{" || ch === "}" || ch === "\\" || ch === "^" || ch === "$" || ch === "|") {
        regexStr += "\\";
      }
      regexStr += ch;
      i += 1;
    }
  }

  const compiled: CompiledPattern = {
    pattern,
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
    isCatchAll
  };

  patternCache.set(pattern, compiled);
  return compiled;
}

/**
 * Match a pathname against a compiled pattern.
 * Returns params if matched, null otherwise.
 */
export function matchPattern(compiled: CompiledPattern, pathname: string): Record<string, string> | null {
  const match = compiled.regex.exec(pathname);
  if (!match) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < compiled.paramNames.length; i++) {
    params[compiled.paramNames[i]] = decodeURIComponent(match[i + 1] ?? "");
  }
  return params;
}

/**
 * Build a path from a pattern and params.
 *
 * @example
 * ```ts
 * buildPath("/products/:id", { id: "kbd" }) // "/products/kbd"
 * ```
 */
export function buildPath(pattern: string, params: Record<string, string> = {}): string {
  let path = pattern;
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, encodeURIComponent(value));
  }
  // Replace catch-all
  if (path.includes("*")) {
    const splat = params["splat"] ?? params["*"] ?? "";
    path = path.replace(/\*[^/]*/g, splat);
  }
  // Clean trailing slashes (except root)
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path;
}

/**
 * Flatten a nested route tree into a list of matchable entries.
 * Each entry has the full path and the chain of routes from root to leaf.
 */
export type FlatRoute = {
  /** Full resolved path pattern. */
  fullPath: string;
  /** Chain of route definitions from root to this route. */
  chain: RouteDefinition[];
  /** The leaf route definition. */
  route: RouteDefinition;
};

export function flattenRoutes(routes: RouteDefinition[], parentPath = ""): FlatRoute[] {
  const flat: FlatRoute[] = [];

  for (const route of routes) {
    const segment = route.path.startsWith("/") ? route.path : `/${route.path}`;
    const fullPath = normalizePath(parentPath + segment);

    const chain = [route];

    // Add this route first (parent before children)
    flat.push({ fullPath, chain, route });

    if (route.children && route.children.length > 0) {
      const childFlat = flattenRoutes(route.children, fullPath);
      for (const child of childFlat) {
        flat.push({
          fullPath: child.fullPath,
          chain: [...chain, ...child.chain],
          route: child.route
        });
      }
    }
  }

  return flat;
}

/**
 * Match a pathname against the flattened route tree.
 * Returns the best match (first exact match, then catch-all).
 */
export function matchRoutes(routes: FlatRoute[], pathname: string): RouteMatch | null {
  let bestMatch: RouteMatch | null = null;
  let bestScore = -1;

  for (const flatRoute of routes) {
    const compiled = compilePattern(flatRoute.fullPath);
    const params = matchPattern(compiled, pathname);

    if (params === null) continue;

    // Score: static segments score higher than dynamic, catch-all scores lowest
    const score = compiled.isCatchAll ? 0 : (compiled.paramNames.length === 0 ? 2 : 1);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        route: flatRoute.route,
        params,
        search: {},
        fullPath: flatRoute.fullPath,
        loaderData: null,
        error: null,
        pending: false,
        meta: {}
      };
    }
  }

  return bestMatch;
}

/** Normalize a path — remove trailing slash, collapse double slashes. */
export function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  // Collapse double slashes
  let normalized = path.replace(/\/+/g, "/");
  // Remove trailing slash
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Parse search params from a search string.
 */
export function parseSearch(search: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!search || search === "?") return result;

  const params = new URLSearchParams(search);
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

/**
 * Serialize search params to a search string.
 */
export function serializeSearch(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        search.append(key, String(item));
      }
    } else {
      search.set(key, String(value));
    }
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}

/**
 * Interpolate a path pattern with params and search.
 */
export function interpolatePath(
  pattern: string,
  params: Record<string, string> = {},
  search?: Record<string, unknown>
): string {
  const path = buildPath(pattern, params);
  if (!search || Object.keys(search).length === 0) return path;
  return path + serializeSearch(search);
}
