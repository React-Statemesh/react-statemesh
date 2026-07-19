import { Suspense, lazy, useState, useEffect, type ComponentType } from "react";
import { useRouter } from "./RouterProvider";
import type { RouteMatch } from "../router/types";

const componentCache = new Map<string, ComponentType<Record<string, unknown>>>();

/**
 * Renders the matched route's component.
 * Used for nested route layouts.
 *
 * @example
 * ```tsx
 * function Layout() {
 *   return (
 *     <div>
 *       <nav>...</nav>
 *       <Outlet />
 *     </div>
 *   );
 * }
 * ```
 */
export function Outlet() {
  const { currentMatch, pendingMatch } = useRouter();

  if (!currentMatch) {
    return null;
  }

  return <RouteRenderer match={currentMatch} pendingMatch={pendingMatch} />;
}

function RouteRenderer({ match, pendingMatch }: { match: RouteMatch; pendingMatch: RouteMatch | null }) {
  const route = match.route;
  const [Component, setComponent] = useState<ComponentType<Record<string, unknown>> | null>(() => {
    if (!route.component) return null;
    const cached = componentCache.get(match.fullPath);
    return cached ?? null;
  });

  const [PendingComponent, setPendingComponent] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [ErrorComponent, setErrorComponent] = useState<ComponentType<Record<string, unknown>> | null>(null);

  // Load main component
  useEffect(() => {
    if (!route.component) return;
    if (Component) return;

    let cancelled = false;
    const loader = route.component;

    loader().then((mod) => {
      if (!cancelled) {
        const comp = mod.default ?? mod;
        componentCache.set(match.fullPath, comp as ComponentType<Record<string, unknown>>);
        setComponent(comp as ComponentType<Record<string, unknown>>);
      }
    });

    return () => { cancelled = true; };
  }, [route.component, match.fullPath]);

  // Load pending component
  useEffect(() => {
    if (!route.pendingComponent || !pendingMatch) return;

    let cancelled = false;
    const loader = route.pendingComponent;

    loader().then((mod) => {
      if (!cancelled) {
        setPendingComponent((mod.default ?? mod) as ComponentType<Record<string, unknown>>);
      }
    });

    return () => { cancelled = true; };
  }, [route.pendingComponent, pendingMatch]);

  // Load error component
  useEffect(() => {
    if (!route.errorComponent || !match.error) return;

    let cancelled = false;
    const loader = route.errorComponent;

    loader().then((mod) => {
      if (!cancelled) {
        setErrorComponent((mod.default ?? mod) as ComponentType<Record<string, unknown>>);
      }
    });

    return () => { cancelled = true; };
  }, [route.errorComponent, match.error]);

  // Render error component if there's an error
  if (match.error && ErrorComponent) {
    return <ErrorComponent error={match.error} reset={() => {}} />;
  }

  // Render pending component during navigation
  if (pendingMatch && PendingComponent) {
    return <PendingComponent />;
  }

  // Render main component
  if (Component) {
    return <Component {...match.params} loaderData={match.loaderData} match={match} />;
  }

  // Fallback while loading
  if (route.component) {
    return null;
  }

  return null;
}
