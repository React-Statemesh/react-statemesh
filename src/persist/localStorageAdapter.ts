import { createWebStorageAdapter } from "./storage";

/** Create an SSR-safe `localStorage` persistence adapter. */
export function createLocalStorageAdapter() {
  return createWebStorageAdapter("localStorage");
}
