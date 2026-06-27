import { describe, expect, it, beforeEach } from "vitest";
import { compilePattern, matchPattern, buildPath, matchRoutes, flattenRoutes, parseSearch, serializeSearch, interpolatePath, normalizePath } from "../../src/router/matchRoutes";
import { defineRoutes } from "../../src/router/defineRoutes";
import { createMemoryHistory } from "../../src/router/historyAdapter";
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
    expect(routes[0].path).toBe("/products");
    expect(routes[1].children?.[0].path).toBe("/profile");
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
    expect(flat[0].fullPath).toBe("/products");
    expect(flat[1].fullPath).toBe("/products/:id");
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
    expect(routes[0].path).toBe("/products");
    expect(routes[1].path).toBe("/");
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
    expect(routes[0].path).toBe("/settings");
    expect(routes[0].children?.[0].path).toBe("/profile");
    expect(routes[0].children?.[1].path).toBe("/billing");
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
});
