import type { EqualityFn } from "./equality";

/**
 * Create a memoized selector with explicit dependency tracking.
 *
 * The selector only recomputes when at least one dependency value changes (by `Object.is`).
 * This avoids unnecessary recomputation in `useMeshSelector` when the same selector is
 * recreated on every render.
 *
 * @example
 * ```ts
 * const selectCartTotal = createSelector(
 *   [(state) => state.cart.items],
 *   (items) => items.reduce((sum, item) => sum + item.price * item.quantity, 0)
 * );
 *
 * function CartTotal() {
 *   const total = useMeshSelector(selectCartTotal);
 *   return <strong>{total}</strong>;
 * }
 * ```
 */
export function createSelector<TState, TDeps extends unknown[], TResult>(
  deps: { [K in keyof TDeps]: (state: TState) => TDeps[K] },
  compute: (...deps: TDeps) => TResult,
  equality?: EqualityFn<TDeps[number]>
): (state: TState) => TResult {
  let lastDeps: TDeps | null = null;
  let lastResult: TResult | undefined;
  let initialized = false;

  const anyEqual: EqualityFn<unknown> = equality ?? Object.is;

  return (state: TState): TResult => {
    const currentDeps = deps.map((dep) => dep(state)) as TDeps;

    if (initialized && lastDeps !== null) {
      const allSame = currentDeps.every((dep, i) => anyEqual(dep, (lastDeps as TDeps)[i]));
      if (allSame) return lastResult as TResult;
    }

    lastDeps = currentDeps;
    lastResult = compute(...currentDeps);
    initialized = true;
    return lastResult as TResult;
  };
}
