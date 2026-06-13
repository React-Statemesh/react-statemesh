/** Equality function signature used by selectors, computed values, and subscriptions. */
export type EqualityFn<T> = (a: T, b: T) => boolean;

/**
 * Shallow compare two objects with `Object.is` semantics for property values.
 *
 * Useful as a selector equality function.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;

  const aRecord = a as Record<PropertyKey, unknown>;
  const bRecord = b as Record<PropertyKey, unknown>;
  const aKeys = Reflect.ownKeys(aRecord);
  const bKeys = Reflect.ownKeys(bRecord);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bRecord, key)) return false;
    if (!Object.is(aRecord[key], bRecord[key])) return false;
  }

  return true;
}
