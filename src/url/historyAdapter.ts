import { isBrowser } from "../utils";

/** SSR-safe wrapper around `window.history.replaceState`. */
export function replaceUrl(url: URL): void {
  if (isBrowser()) window.history.replaceState(null, "", url);
}

/** SSR-safe wrapper around `window.history.pushState`. */
export function pushUrl(url: URL): void {
  if (isBrowser()) window.history.pushState(null, "", url);
}
