import { useRef, useEffect, useState, type ReactNode, type CSSProperties } from "react";

export type SharedElementProps = {
  /** Unique ID matching the element on the other route. */
  id: string;
  /** Children to render. */
  children: ReactNode;
  /** Additional CSS class. */
  className?: string;
  /** Inline styles. */
  style?: CSSProperties;
  /** Animation duration in ms. Defaults to 300. */
  duration?: number;
  /** Easing function. Defaults to "ease-in-out". */
  easing?: string;
};

const sharedElementRegistry = new Map<string, DOMRect>();

/**
 * Shared element for route transitions.
 *
 * Place matching `SharedElement` components on both the source and target routes.
 * The router animates between them using FLIP (First, Last, Invert, Play).
 *
 * @example
 * ```tsx
 * // Product list
 * <SharedElement id={`product-image-${product.id}`}>
 *   <img src={product.image} />
 * </SharedElement>
 *
 * // Product detail
 * <SharedElement id={`product-image-${product.id}`}>
 *   <img src={product.image} className="hero" />
 * </SharedElement>
 * ```
 */
export function SharedElement({ id, children, className, style, duration = 300, easing = "ease-in-out" }: SharedElementProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevRect = sharedElementRegistry.get(id);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const currentRect = element.getBoundingClientRect();

    if (prevRect) {
      // FLIP animation
      const deltaX = prevRect.left - currentRect.left;
      const deltaY = prevRect.top - currentRect.top;
      const deltaW = prevRect.width / currentRect.width;
      const deltaH = prevRect.height / currentRect.height;

      // Only animate if position actually changed
      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1 || Math.abs(deltaW - 1) > 0.01 || Math.abs(deltaH - 1) > 0.01) {
        setIsAnimating(true);

        // Invert: apply the inverse transform
        element.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaW}, ${deltaH})`;
        element.style.transition = "none";

        // Force reflow
        element.getBoundingClientRect();

        // Play: animate to final position
        element.style.transition = `transform ${duration}ms ${easing}`;
        element.style.transform = "";

        const handleEnd = () => {
          element.style.transition = "";
          element.style.transform = "";
          setIsAnimating(false);
        };

        element.addEventListener("transitionend", handleEnd, { once: true });
      }
    }

    // Store current rect for next navigation
    sharedElementRegistry.set(id, currentRect);

    return () => {
      // Clean up on unmount
      sharedElementRegistry.delete(id);
    };
  }, [id, prevRect, duration, easing]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        ...(isAnimating ? { zIndex: 10 } : {})
      }}
      data-shared-element={id}
    >
      {children}
    </div>
  );
}
