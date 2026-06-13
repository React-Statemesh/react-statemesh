import { createWebStorageAdapter } from "./storage";

/** Create an SSR-safe `sessionStorage` persistence adapter. */
export function createSessionStorageAdapter() {
  return createWebStorageAdapter("sessionStorage");
}
