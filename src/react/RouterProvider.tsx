import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Mesh, Unsubscribe } from "../core/types";
import type { MeshRouter, RouteDefinition, RouteMatch, RouterContextValue } from "../router/types";

const RouterContext = createContext<RouterContextValue | null>(null);

export type RouterProviderProps<TState = unknown> = {
  router: MeshRouter<TState>;
  mesh: Mesh<TState>;
  routes: RouteDefinition[];
  children: ReactNode;
};

/**
 * Provides the router context to child components.
 * Must wrap any component using `useNavigate`, `useMatch`, `useParams`, or `Link`.
 */
export function RouterProvider<TState = unknown>({ router, mesh, routes, children }: RouterProviderProps<TState>) {
  const [currentMatch, setCurrentMatch] = useState<RouteMatch | null>(router.getCurrentMatch());
  const [pendingMatch, setPendingMatch] = useState<RouteMatch | null>(router.getPendingMatch());

  useEffect(() => {
    const unsubscribe = router.subscribe(() => {
      setCurrentMatch(router.getCurrentMatch());
      setPendingMatch(router.getPendingMatch());
    });
    return unsubscribe;
  }, [router]);

  const value: RouterContextValue<TState> = {
    router,
    mesh,
    currentMatch,
    pendingMatch,
    routes
  };

  return (
    <RouterContext.Provider value={value as RouterContextValue}>
      {children}
    </RouterContext.Provider>
  );
}

/**
 * Get the router context. Throws if used outside `RouterProvider`.
 */
export function useRouter<TState = unknown>(): RouterContextValue<TState> {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error("useRouter must be used inside a RouterProvider.");
  }
  return context as RouterContextValue<TState>;
}
