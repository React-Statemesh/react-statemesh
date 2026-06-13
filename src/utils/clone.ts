/** Clone a state value using `structuredClone` when available, with a JSON fallback. */
export function cloneState<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
