export { defineRoutes } from "./defineRoutes";
export { createRouter } from "./createRouter";
export { redirect, RedirectError } from "./types";
export type {
  RouteDefinition,
  RouterOptions,
  MeshRouter,
  RouteMatch,
  NavigationTarget,
  NavigationContext,
  RouteMiddleware,
  RouteGuard,
  RouteLoader,
  RouteBeforeLoad,
  RouteComponentLoader,
  RouteDependencyFn,
  RouteErrorRecovery,
  KeepAliveOptions,
  AnalyticsOptions,
  RouteAnalyticsEvent,
  PredictivePrefetchOptions,
  OfflineOptions,
  RouterState,
  RouterContextValue,
  RouteHistoryEntry
} from "./types";
export { compilePattern, matchPattern, buildPath, matchRoutes, flattenRoutes, interpolatePath, normalizePath, parseSearch, serializeSearch } from "./matchRoutes";
export type { FlatRoute } from "./matchRoutes";
export { createBrowserHistory, createMemoryHistory } from "./historyAdapter";
export type { HistoryAdapter, HistoryLocation, HistoryEntry } from "./historyAdapter";
export { updateDocumentMeta } from "./meta";
export type { RouteMeta } from "./meta";

// React router components — import from "@statemesh/react/router"
export { RouterProvider, useRouter, type RouterProviderProps } from "../react/RouterProvider";
export { Outlet } from "../react/Outlet";
export { Link, type LinkProps } from "../react/Link";
export { SharedElement, type SharedElementProps } from "../react/SharedElement";
