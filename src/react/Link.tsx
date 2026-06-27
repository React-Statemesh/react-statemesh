import { useCallback, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "./RouterProvider";
import { buildPath, serializeSearch } from "../router/matchRoutes";

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  /** Target path pattern. */
  to: string;
  /** Path params. */
  params?: Record<string, string>;
  /** Search params. */
  search?: Record<string, unknown>;
  /** Replace current history entry instead of pushing. */
  replace?: boolean;
  /** Whether the link matches the current route. */
  activeClassName?: string;
  /** Whether to preload the route on hover/focus. */
  preload?: boolean | "hover" | "focus";
  /** Children. */
  children: ReactNode;
};

/**
 * Navigation link component.
 *
 * Renders an `<a>` tag that navigates via the router instead of a full page reload.
 *
 * @example
 * ```tsx
 * <Link to="/products/:id" params={{ id: "kbd" }}>Keyboard</Link>
 * <Link to="/search" search={{ q: "mouse" }}>Search mice</Link>
 * ```
 */
export function Link({
  to,
  params,
  search,
  replace,
  preload = false,
  className,
  activeClassName,
  onClick,
  onMouseEnter,
  onFocus,
  children,
  ...rest
}: LinkProps) {
  const { router, currentMatch } = useRouter();

  const href = buildPath(to, params ?? {}) + serializeSearch(search ?? {});
  const isActive = currentMatch?.fullPath === buildPath(to, params ?? {});
  const resolvedClassName = [className, isActive && activeClassName].filter(Boolean).join(" ") || undefined;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);

      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;

      event.preventDefault();
      router.navigate(to, { params, search, replace });
    },
    [router, to, params, search, replace, onClick]
  );

  const handleMouseEnter = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onMouseEnter?.(event);
      if (preload === true || preload === "hover") {
        router.preload(to, params);
      }
    },
    [router, to, params, preload, onMouseEnter]
  );

  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLAnchorElement>) => {
      if (preload === true || preload === "focus") {
        router.preload(to, params);
      }
    },
    [router, to, params, preload]
  );

  return (
    <a
      href={router.getCurrentMatch() ? href : undefined}
      className={resolvedClassName}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      {...rest}
    >
      {children}
    </a>
  );
}
