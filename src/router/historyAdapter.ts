export type HistoryLocation = {
  pathname: string;
  search: string;
  hash: string;
};

export type HistoryEntry = {
  location: HistoryLocation;
  state: unknown;
};

export type HistoryAdapter = {
  /** Current location. */
  getLocation: () => HistoryLocation;
  /** Push a new entry. */
  push: (path: string, state?: unknown) => void;
  /** Replace the current entry. */
  replace: (path: string, state?: unknown) => void;
  /** Go back. */
  back: () => void;
  /** Go forward. */
  forward: () => void;
  /** Subscribe to location changes. */
  listen: (listener: (location: HistoryLocation, action: "push" | "replace" | "pop") => void) => () => void;
  /** Create a full URL from a path. */
  createHref: (path: string) => string;
};

/**
 * Create a browser history adapter.
 * Uses `window.history` and listens to `popstate`.
 */
export function createBrowserHistory(basename = ""): HistoryAdapter {
  const listeners = new Set<(location: HistoryLocation, action: "push" | "replace" | "pop") => void>();

  function getLocation(): HistoryLocation {
    const { pathname, search, hash } = window.location;
    return {
      pathname: stripBasename(pathname, basename),
      search,
      hash
    };
  }

  function notify(action: "push" | "replace" | "pop") {
    const location = getLocation();
    for (const listener of listeners) {
      listener(location, action);
    }
  }

  function push(path: string, state?: unknown) {
    const url = basename + path;
    window.history.pushState(state, "", url);
    notify("push");
  }

  function replace(path: string, state?: unknown) {
    const url = basename + path;
    window.history.replaceState(state, "", url);
    notify("replace");
  }

  function back() {
    window.history.back();
  }

  function forward() {
    window.history.forward();
  }

  function onPopState() {
    notify("pop");
  }

  function listen(listener: (location: HistoryLocation, action: "push" | "replace" | "pop") => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function createHref(path: string): string {
    return basename + path;
  }

  if (typeof window !== "undefined") {
    window.addEventListener("popstate", onPopState);
  }

  return { getLocation, push, replace, back, forward, listen, createHref };
}

/**
 * Create a memory history adapter for testing and SSR.
 */
export function createMemoryHistory(initialPath = "/", initialEntries?: string[]): HistoryAdapter {
  const entries: HistoryEntry[] = initialEntries
    ? initialEntries.map((path) => ({ location: parsePath(path), state: null }))
    : [{ location: parsePath(initialPath), state: null }];
  let index = 0;
  const listeners = new Set<(location: HistoryLocation, action: "push" | "replace" | "pop") => void>();

  function getLocation(): HistoryLocation {
    return entries[index].location;
  }

  function notify(action: "push" | "replace" | "pop") {
    const location = getLocation();
    for (const listener of listeners) {
      listener(location, action);
    }
  }

  function push(path: string, state?: unknown) {
    // Remove forward entries
    entries.splice(index + 1);
    entries.push({ location: parsePath(path), state });
    index = entries.length - 1;
    notify("push");
  }

  function replace(path: string, state?: unknown) {
    entries[index] = { location: parsePath(path), state };
    notify("replace");
  }

  function back() {
    if (index > 0) {
      index -= 1;
      notify("pop");
    }
  }

  function forward() {
    if (index < entries.length - 1) {
      index += 1;
      notify("pop");
    }
  }

  function listen(listener: (location: HistoryLocation, action: "push" | "replace" | "pop") => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function createHref(path: string): string {
    return path;
  }

  return { getLocation, push, replace, back, forward, listen, createHref };
}

function parsePath(path: string): HistoryLocation {
  let pathname = path;
  let search = "";
  let hash = "";

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex);
  }

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex);
  }

  return { pathname: pathname || "/", search, hash };
}

function stripBasename(pathname: string, basename: string): string {
  if (!basename) return pathname;
  if (pathname === basename) return "/";
  if (pathname.startsWith(basename + "/")) {
    return pathname.slice(basename.length) || "/";
  }
  return pathname;
}
