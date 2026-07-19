import type { RouteDefinition } from "./types";

/**
 * Define a route tree with type inference.
 *
 * @example
 * ```ts
 * const routes = defineRoutes([
 *   { path: "/", component: () => import("./Home") },
 *   { path: "/products", children: [
 *     { path: ":id", component: () => import("./Product") }
 *   ]}
 * ]);
 * ```
 */
export function defineRoutes(routes: RouteDefinition[]): RouteDefinition[] {
  return routes.map((route) => normalizeRoute(route));
}

function normalizeRoute(route: RouteDefinition): RouteDefinition {
  const normalized: RouteDefinition = {
    ...route,
    path: normalizePath(route.path)
  };

  if (route.children) {
    normalized.children = route.children.map((child) => normalizeRoute(child));
  }

  return normalized;
}

function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  // Remove trailing slash
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}
