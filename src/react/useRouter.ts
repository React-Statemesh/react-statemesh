import { useCallback, useSyncExternalStore } from "react";
import { useRouter } from "./RouterProvider";

/**
 * Returns a stable `navigate` function for programmatic navigation.
 *
 * @example
 * ```tsx
 * const navigate = useNavigate();
 * navigate("/products/:id", { params: { id: "kbd" } });
 * ```
 */
export function useNavigate() {
  const { router } = useRouter();

  const subscribe = useCallback(() => () => {}, []);
  const getSnapshot = useCallback(() => router.navigate, [router]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Returns the current route match.
 *
 * @example
 * ```tsx
 * const match = useMatch();
 * console.log(match?.params, match?.loaderData);
 * ```
 */
export function useMatch() {
  const { currentMatch, pendingMatch, router } = useRouter();

  const subscribe = useCallback(
    (listener: () => void) => router.subscribe(listener),
    [router]
  );
  const getSnapshot = useCallback(() => router.getCurrentMatch(), [router]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Returns the current route's path params.
 *
 * @example
 * ```tsx
 * const { id } = useParams();
 * ```
 */
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  const match = useMatch();
  return (match?.params ?? {}) as T;
}

/**
 * Returns the current route's search params.
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useSearch();
 * ```
 */
export function useSearch<T extends Record<string, unknown> = Record<string, unknown>>(): [T, (search: Partial<T>) => void] {
  const { router, mesh } = useRouter();
  const match = useMatch();
  const search = (match?.search ?? {}) as T;

  const setSearch = useCallback(
    (partial: Partial<T>) => {
      const current = router.getCurrentMatch();
      if (!current) return;
      const newSearch = { ...current.search, ...partial } as Record<string, unknown>;
      router.navigate(current.fullPath, {
        params: current.params,
        search: newSearch,
        replace: true
      });
    },
    [router]
  );

  return [search, setSearch];
}
