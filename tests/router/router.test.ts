import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { compilePattern, matchPattern, buildPath, matchRoutes, flattenRoutes, parseSearch, serializeSearch, interpolatePath, normalizePath } from "../../src/router/matchRoutes";
import { defineRoutes } from "../../src/router/defineRoutes";
import { createMemoryHistory, createBrowserHistory } from "../../src/router/historyAdapter";
import { updateDocumentMeta } from "../../src/router/meta";
import { redirect, RedirectError } from "../../src/router/types";
import type { RouteDefinition } from "../../src/router/types";

describe("Router — Pattern Matching", () => {
  it("matches static paths", () => {
    const compiled = compilePattern("/products");
    expect(matchPattern(compiled, "/products")).toEqual({});
    expect(matchPattern(compiled, "/other")).toBeNull();
  });

  it("matches dynamic params", () => {
    const compiled = compilePattern("/products/:id");
    expect(matchPattern(compiled, "/products/kbd")).toEqual({ id: "kbd" });
    expect(matchPattern(compiled, "/products/123")).toEqual({ id: "123" });
    expect(matchPattern(compiled, "/products")).toBeNull();
    expect(matchPattern(compiled, "/products/kbd/extra")).toBeNull();
  });

  it("matches multiple params", () => {
    const compiled = compilePattern("/orgs/:orgId/repos/:repoId");
    expect(matchPattern(compiled, "/orgs/acme/repos/widget")).toEqual({
      orgId: "acme",
      repoId: "widget"
    });
  });

  it("matches catch-all patterns", () => {
    const compiled = compilePattern("/files/*path");
    expect(matchPattern(compiled, "/files/docs/readme.md")).toEqual({ path: "docs/readme.md" });
    expect(matchPattern(compiled, "/files/a")).toEqual({ path: "a" });
  });

  it("builds paths from patterns and params", () => {
    expect(buildPath("/products/:id", { id: "kbd" })).toBe("/products/kbd");
    expect(buildPath("/orgs/:orgId/repos/:repoId", { orgId: "acme", repoId: "w" })).toBe("/orgs/acme/repos/w");
  });

  it("handles root path", () => {
    const compiled = compilePattern("/");
    expect(matchPattern(compiled, "/")).toEqual({});
    expect(matchPattern(compiled, "/other")).toBeNull();
  });

  it("decodes URI-encoded params", () => {
    const compiled = compilePattern("/products/:id");
    expect(matchPattern(compiled, "/products/hello%20world")).toEqual({ id: "hello world" });
  });
});

describe("Router — Route Tree", () => {
  it("defines routes with normalizePath", () => {
    const routes = defineRoutes([
      { path: "/products/", component: undefined },
      { path: "/settings", children: [{ path: "/profile/", component: undefined }] }
    ]);
    expect(routes[0]!.path).toBe("/products");
    expect(routes[1]!.children?.[0]!.path).toBe("/profile");
  });

  it("flattens nested routes into matchable entries", () => {
    const routes = defineRoutes([
      {
        path: "/products",
        component: undefined,
        children: [
          { path: ":id", component: undefined }
        ]
      }
    ]);
    const flat = flattenRoutes(routes);
    expect(flat).toHaveLength(2);
    expect(flat[0]!.fullPath).toBe("/products");
    expect(flat[1]!.fullPath).toBe("/products/:id");
  });

  it("matches routes and returns RouteMatch", () => {
    const routes = defineRoutes([
      { path: "/", component: undefined },
      { path: "/products", component: undefined, children: [
        { path: ":id", component: undefined }
      ]},
      { path: "*" }
    ]);
    const flat = flattenRoutes(routes);

    const match1 = matchRoutes(flat, "/");
    expect(match1).not.toBeNull();
    expect(match1!.fullPath).toBe("/");

    const match2 = matchRoutes(flat, "/products/kbd");
    expect(match2).not.toBeNull();
    expect(match2!.params).toEqual({ id: "kbd" });

    const match3 = matchRoutes(flat, "/nonexistent");
    expect(match3).not.toBeNull();
    expect(match3!.fullPath).toBe("/*");
  });

  it("prefers static matches over dynamic", () => {
    const routes = defineRoutes([
      { path: "/products/new", component: undefined },
      { path: "/products/:id", component: undefined }
    ]);
    const flat = flattenRoutes(routes);

    const match1 = matchRoutes(flat, "/products/new");
    expect(match1!.fullPath).toBe("/products/new");

    const match2 = matchRoutes(flat, "/products/123");
    expect(match2!.fullPath).toBe("/products/:id");
  });
});

describe("Router — History Adapter", () => {
  it("creates memory history with initial path", () => {
    const history = createMemoryHistory("/initial");
    expect(history.getLocation().pathname).toBe("/initial");
  });

  it("pushes and navigates", () => {
    const history = createMemoryHistory("/");
    history.push("/products");
    expect(history.getLocation().pathname).toBe("/products");
    history.push("/products/kbd");
    expect(history.getLocation().pathname).toBe("/products/kbd");
  });

  it("goes back and forward", () => {
    const history = createMemoryHistory("/");
    history.push("/a");
    history.push("/b");
    expect(history.getLocation().pathname).toBe("/b");
    history.back();
    expect(history.getLocation().pathname).toBe("/a");
    history.back();
    expect(history.getLocation().pathname).toBe("/");
    history.forward();
    expect(history.getLocation().pathname).toBe("/a");
  });

  it("replaces current entry", () => {
    const history = createMemoryHistory("/");
    history.push("/a");
    history.replace("/b");
    expect(history.getLocation().pathname).toBe("/b");
    history.back();
    expect(history.getLocation().pathname).toBe("/");
  });

  it("notifies listeners", () => {
    const history = createMemoryHistory("/");
    const actions: string[] = [];
    history.listen((_loc, action) => actions.push(action));
    history.push("/a");
    history.replace("/b");
    history.back();
    expect(actions).toEqual(["push", "replace", "pop"]);
  });

  it("initializes from entries array", () => {
    const history = createMemoryHistory("/", ["/a", "/b", "/c"]);
    expect(history.getLocation().pathname).toBe("/a");
    history.forward();
    expect(history.getLocation().pathname).toBe("/b");
  });
});

describe("Router — Search Params", () => {
  it("parses search string", () => {
    expect(parseSearch("?q=keyboard&page=2")).toEqual({ q: "keyboard", page: "2" });
    expect(parseSearch("")).toEqual({});
    expect(parseSearch("?empty=")).toEqual({ empty: "" });
  });

  it("serializes search params", () => {
    expect(serializeSearch({ q: "keyboard", page: "2" })).toBe("?q=keyboard&page=2");
    expect(serializeSearch({})).toBe("");
    expect(serializeSearch({ q: "", page: null })).toBe("");
  });

  it("interpolates path with params and search", () => {
    expect(interpolatePath("/products/:id", { id: "kbd" }, { tab: "reviews" })).toBe("/products/kbd?tab=reviews");
    expect(interpolatePath("/products/:id", { id: "kbd" })).toBe("/products/kbd");
  });

  it("handles arrays in search params", () => {
    expect(serializeSearch({ tags: ["a", "b"] })).toBe("?tags=a&tags=b");
  });
});

describe("Router — Redirect", () => {
  it("creates redirect errors", () => {
    const err = redirect("/login", { search: { returnTo: "/checkout" } });
    expect(err).toBeInstanceOf(RedirectError);
    expect(err.target).toBe("/login");
    expect(err.search).toEqual({ returnTo: "/checkout" });
    expect(err.replace).toBe(false);
  });

  it("creates replace redirects", () => {
    const err = redirect("/new-path", { replace: true });
    expect(err.replace).toBe(true);
  });

  it("includes params", () => {
    const err = redirect("/products/:id", { params: { id: "kbd" } });
    expect(err.params).toEqual({ id: "kbd" });
  });
});

describe("Router — defineRoutes", () => {
  it("normalizes paths", () => {
    const routes = defineRoutes([
      { path: "/products/" },
      { path: "/" }
    ]);
    expect(routes[0]!.path).toBe("/products");
    expect(routes[1]!.path).toBe("/");
  });

  it("normalizes nested paths", () => {
    const routes = defineRoutes([
      {
        path: "/settings/",
        children: [
          { path: "/profile/" },
          { path: "/billing/" }
        ]
      }
    ]);
    expect(routes[0]!.path).toBe("/settings");
    expect(routes[0]!.children?.[0]!.path).toBe("/profile");
    expect(routes[0]!.children?.[1]!.path).toBe("/billing");
  });
});

describe("Router — normalizePath", () => {
  it("removes trailing slashes", () => {
    expect(normalizePath("/products/")).toBe("/products");
    expect(normalizePath("/")).toBe("/");
  });

  it("collapses double slashes", () => {
    expect(normalizePath("//products//kbd")).toBe("/products/kbd");
  });

  it("handles empty string", () => {
    expect(normalizePath("")).toBe("/");
  });

  it("handles triple slashes", () => {
    expect(normalizePath("///a///b")).toBe("/a/b");
  });
});

// ---------------------------------------------------------------------------
// Edge cases for existing functions
// ---------------------------------------------------------------------------
describe("Router — Edge Cases", () => {
  it("compilePattern handles regex-special characters in static segments", () => {
    const compiled = compilePattern("/files/:name");
    expect(matchPattern(compiled, "/files/test")).toEqual({ name: "test" });
  });

  it("compilePattern caches results", () => {
    const a = compilePattern("/cached");
    const b = compilePattern("/cached");
    expect(a).toBe(b);
  });

  it("buildPath with catch-all * replacement", () => {
    expect(buildPath("/files/*", { "*": "docs/readme.md" })).toBe("/files/docs%2Freadme.md");
  });

  it("buildPath leaves literal :key when param missing", () => {
    expect(buildPath("/products/:id")).toBe("/products/:id");
  });

  it("buildPath strips trailing slash", () => {
    expect(buildPath("/products/")).toBe("/products");
  });

  it("buildPath encodes param values", () => {
    expect(buildPath("/products/:id", { id: "hello world" })).toBe("/products/hello%20world");
  });

  it("flattenRoutes handles deep nesting", () => {
    const routes = defineRoutes([
      {
        path: "/a",
        children: [
          {
            path: "b",
            children: [
              { path: "c" }
            ]
          }
        ]
      }
    ]);
    const flat = flattenRoutes(routes);
    expect(flat).toHaveLength(3);
    expect(flat[0]!.fullPath).toBe("/a");
    expect(flat[1]!.fullPath).toBe("/a/b");
    expect(flat[2]!.fullPath).toBe("/a/b/c");
  });

  it("flattenRoutes handles empty children", () => {
    const routes = defineRoutes([{ path: "/empty", children: [] }]);
    const flat = flattenRoutes(routes);
    expect(flat).toHaveLength(1);
  });

  it("matchRoutes with empty routes array", () => {
    expect(matchRoutes([], "/anything")).toBeNull();
  });

  it("parseSearch without ? prefix", () => {
    expect(parseSearch("q=keyboard")).toEqual({ q: "keyboard" });
  });

  it("parseSearch with duplicate keys (last wins)", () => {
    const result = parseSearch("?tags=a&tags=b");
    expect(result.tags).toBe("b");
  });

  it("serializeSearch filters undefined values", () => {
    expect(serializeSearch({ a: "1", b: undefined })).toBe("?a=1");
  });

  it("serializeSearch handles booleans and numbers", () => {
    expect(serializeSearch({ active: true, count: 0 })).toBe("?active=true&count=0");
  });

  it("RedirectError has correct name and code", () => {
    const err = redirect("/login");
    expect(err.name).toBe("RedirectError");
    expect(err.code).toBe("STATEMESH_REDIRECT");
    expect(err.message).toBe("Redirect to /login");
  });

  it("redirect defaults replace to false", () => {
    const err = redirect("/login");
    expect(err.replace).toBe(false);
  });

  it("redirect with no options", () => {
    const err = redirect("/login");
    expect(err.target).toBe("/login");
    expect(err.params).toBeUndefined();
    expect(err.search).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createBrowserHistory
// ---------------------------------------------------------------------------
describe("createBrowserHistory", () => {
  it("getLocation returns pathname, search, hash", () => {
    window.history.replaceState(null, "", "/test?a=1#hash");
    const history = createBrowserHistory();
    const loc = history.getLocation();
    expect(loc.pathname).toBe("/test");
    expect(loc.search).toBe("?a=1");
    expect(loc.hash).toBe("#hash");
  });

  it("push navigates and notifies listeners", () => {
    const history = createBrowserHistory();
    const actions: string[] = [];
    history.listen((_loc, action) => actions.push(action));
    history.push("/new-path");
    expect(actions).toEqual(["push"]);
  });

  it("replace navigates and notifies listeners", () => {
    const history = createBrowserHistory();
    const actions: string[] = [];
    history.listen((_loc, action) => actions.push(action));
    history.replace("/replaced");
    expect(actions).toEqual(["replace"]);
  });

  it("listen returns unsubscribe function", () => {
    const history = createBrowserHistory();
    const calls: string[] = [];
    const unsub = history.listen(() => calls.push("called"));
    history.push("/a");
    unsub();
    history.push("/b");
    expect(calls).toEqual(["called"]);
  });

  it("createHref prepends basename", () => {
    const history = createBrowserHistory("/app");
    expect(history.createHref("/products")).toBe("/app/products");
  });

  it("strips basename from pathname", () => {
    window.history.replaceState(null, "", "/app/products");
    const history = createBrowserHistory("/app");
    expect(history.getLocation().pathname).toBe("/products");
  });

  it("basename exact match returns '/'", () => {
    window.history.replaceState(null, "", "/app");
    const history = createBrowserHistory("/app");
    expect(history.getLocation().pathname).toBe("/");
  });

  it("pathname not starting with basename returns full pathname", () => {
    window.history.replaceState(null, "", "/other/path");
    const history = createBrowserHistory("/app");
    expect(history.getLocation().pathname).toBe("/other/path");
  });

  it("empty basename returns full pathname", () => {
    window.history.replaceState(null, "", "/products");
    const history = createBrowserHistory();
    expect(history.getLocation().pathname).toBe("/products");
  });
});

// ---------------------------------------------------------------------------
// updateDocumentMeta
// ---------------------------------------------------------------------------
describe("updateDocumentMeta", () => {
  it("sets document.title", () => {
    updateDocumentMeta({ title: "Test Page" });
    expect(document.title).toBe("Test Page");
  });

  it("creates meta description tag", () => {
    updateDocumentMeta({ description: "A test page" });
    const meta = document.querySelector('meta[name="description"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute("content")).toBe("A test page");
  });

  it("creates Open Graph tags", () => {
    updateDocumentMeta({ title: "OG Test", ogImage: "https://example.com/img.png", ogType: "website" });
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe("OG Test");
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe("https://example.com/img.png");
    expect(document.querySelector('meta[property="og:type"]')?.getAttribute("content")).toBe("website");
  });

  it("creates canonical link", () => {
    updateDocumentMeta({ canonical: "https://example.com/page" });
    const link = document.querySelector('link[rel="canonical"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("https://example.com/page");
  });

  it("updates existing meta tags instead of creating duplicates", () => {
    updateDocumentMeta({ description: "First" });
    updateDocumentMeta({ description: "Second" });
    const metas = document.querySelectorAll('meta[name="description"]');
    expect(metas).toHaveLength(1);
    expect(metas[0]!.getAttribute("content")).toBe("Second");
  });

  it("handles additional custom string meta keys", () => {
    updateDocumentMeta({ author: "Test Author" });
    const meta = document.querySelector('meta[name="author"]');
    expect(meta?.getAttribute("content")).toBe("Test Author");
  });

  it("skips non-string values in additional keys", () => {
    updateDocumentMeta({ count: 42, active: true } as any);
    expect(document.querySelector('meta[name="count"]')).toBeNull();
    expect(document.querySelector('meta[name="active"]')).toBeNull();
  });

  it("handles empty meta object", () => {
    const titleBefore = document.title;
    updateDocumentMeta({});
    expect(document.title).toBe(titleBefore);
  });

  afterEach(() => {
    // Clean up meta tags between tests
    document.querySelectorAll('meta[name], meta[property]').forEach((el) => el.remove());
    document.querySelectorAll('link[rel="canonical"]').forEach((el) => el.remove());
  });
});
