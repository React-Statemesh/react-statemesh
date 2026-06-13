/** Return true when running in a browser with `window.document`. */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}
