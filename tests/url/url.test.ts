import { describe, expect, it, vi } from "vitest";
import { DuplicateRegistrationError, createMesh } from "../../src";
import { toQueryParams } from "../../src/url/queryParams";
import { numberUrlSerializer, booleanUrlSerializer } from "../../src/url/serializers";
import { replaceUrl, pushUrl } from "../../src/url/historyAdapter";

// ---------------------------------------------------------------------------
// toQueryParams
// ---------------------------------------------------------------------------
describe("toQueryParams", () => {
  it("converts standard values to URLSearchParams", () => {
    const params = toQueryParams({ search: "keyboards", page: 2 });
    expect(params.get("search")).toBe("keyboards");
    expect(params.get("page")).toBe("2");
  });

  it("omits null and undefined values", () => {
    const params = toQueryParams({ a: null, b: undefined, c: "keep" });
    expect(params.has("a")).toBe(false);
    expect(params.has("b")).toBe(false);
    expect(params.get("c")).toBe("keep");
  });

  it("omits empty string values", () => {
    const params = toQueryParams({ empty: "", filled: "yes" });
    expect(params.has("empty")).toBe(false);
    expect(params.get("filled")).toBe("yes");
  });

  it("includes zero as '0'", () => {
    const params = toQueryParams({ count: 0 });
    expect(params.get("count")).toBe("0");
  });

  it("includes false as 'false'", () => {
    const params = toQueryParams({ active: false });
    expect(params.get("active")).toBe("false");
  });

  it("joins arrays with commas", () => {
    const params = toQueryParams({ tags: ["a", "b", "c"] });
    expect(params.get("tags")).toBe("a,b,c");
  });

  it("returns empty URLSearchParams for empty object", () => {
    const params = toQueryParams({});
    expect(params.toString()).toBe("");
  });

  it("stringifies nested objects as [object Object]", () => {
    const params = toQueryParams({ nested: { a: 1 } });
    expect(params.get("nested")).toBe("[object Object]");
  });
});

// ---------------------------------------------------------------------------
// numberUrlSerializer
// ---------------------------------------------------------------------------
describe("numberUrlSerializer", () => {
  it("parse('42') returns 42", () => {
    expect(numberUrlSerializer.parse("42")).toBe(42);
  });

  it("parse('3.14') returns 3.14", () => {
    expect(numberUrlSerializer.parse("3.14")).toBe(3.14);
  });

  it("parse(null) returns 0", () => {
    expect(numberUrlSerializer.parse(null)).toBe(0);
  });

  it("parse('abc') returns NaN", () => {
    expect(numberUrlSerializer.parse("abc")).toBeNaN();
  });

  it("parse('') returns 0", () => {
    expect(numberUrlSerializer.parse("")).toBe(0);
  });

  it("serialize(42) returns '42'", () => {
    expect(numberUrlSerializer.serialize(42)).toBe("42");
  });

  it("serialize(NaN) returns 'NaN'", () => {
    expect(numberUrlSerializer.serialize(NaN)).toBe("NaN");
  });

  it("serialize(Infinity) returns 'Infinity'", () => {
    expect(numberUrlSerializer.serialize(Infinity)).toBe("Infinity");
  });

  it("serialize(-0) returns '0'", () => {
    expect(numberUrlSerializer.serialize(-0)).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// booleanUrlSerializer
// ---------------------------------------------------------------------------
describe("booleanUrlSerializer", () => {
  it("parse('true') returns true", () => {
    expect(booleanUrlSerializer.parse("true")).toBe(true);
  });

  it("parse('false') returns false", () => {
    expect(booleanUrlSerializer.parse("false")).toBe(false);
  });

  it("parse(null) returns false", () => {
    expect(booleanUrlSerializer.parse(null)).toBe(false);
  });

  it("parse('') returns false", () => {
    expect(booleanUrlSerializer.parse("")).toBe(false);
  });

  it("parse('TRUE') returns false (case-sensitive)", () => {
    expect(booleanUrlSerializer.parse("TRUE")).toBe(false);
  });

  it("parse('1') returns false (strict equality)", () => {
    expect(booleanUrlSerializer.parse("1")).toBe(false);
  });

  it("serialize(true) returns 'true'", () => {
    expect(booleanUrlSerializer.serialize(true)).toBe("true");
  });

  it("serialize(false) returns 'false'", () => {
    expect(booleanUrlSerializer.serialize(false)).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// replaceUrl / pushUrl
// ---------------------------------------------------------------------------
describe("history adapters", () => {
  it("replaceUrl calls history.replaceState in browser", () => {
    const spy = vi.spyOn(window.history, "replaceState");
    const url = new URL(window.location.href);
    url.pathname = "/new-path";
    replaceUrl(url);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("pushUrl calls history.pushState in browser", () => {
    const spy = vi.spyOn(window.history, "pushState");
    const url = new URL(window.location.href);
    url.pathname = "/push-path";
    pushUrl(url);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("replaceUrl does not throw for same-origin URL", () => {
    const url = new URL(window.location.href);
    url.pathname = "/test-replace";
    expect(() => replaceUrl(url)).not.toThrow();
  });

  it("pushUrl does not throw for same-origin URL", () => {
    const url = new URL(window.location.href);
    url.pathname = "/test-push";
    expect(() => pushUrl(url)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// URL state integration (existing tests, preserved and expanded)
// ---------------------------------------------------------------------------
describe("URL state", () => {
  it("reads defaults from query params and writes updates", () => {
    window.history.replaceState(null, "", "/products?search=keyboards&page=2&sale=true");
    const mesh = createMesh({ state: { ready: true } });

    mesh.urlState("products.filters", {
      search: "",
      page: 1,
      sale: false
    });

    expect(mesh.getUrlState("products.filters")).toEqual({
      search: "keyboards",
      page: 2,
      sale: true
    });

    mesh.setUrlState("products.filters", { search: "mice", page: 1 });
    expect(window.location.search).toContain("search=mice");
    expect(window.location.search).toContain("page=1");
  });

  it("supports custom query parameter names", () => {
    window.history.replaceState(null, "", "/products?q=keyboards&p=2&available=true");
    const mesh = createMesh({ state: { ready: true } });

    mesh.urlState("products.filters", {
      search: "",
      page: 1,
      sale: false
    }, {
      paramNames: {
        search: "q",
        page: "p",
        sale: "available"
      }
    });

    expect(mesh.getUrlState("products.filters")).toEqual({
      search: "keyboards",
      page: 2,
      sale: true
    });

    mesh.setUrlState("products.filters", { search: "mice", page: 1, sale: false });
    expect(window.location.search).toContain("q=mice");
    expect(window.location.search).toContain("p=1");
    expect(window.location.search).toContain("available=false");
    expect(window.location.search).not.toContain("search=");
  });

  it("supports generated query parameter names", () => {
    window.history.replaceState(null, "", "/products?filter_search=keyboards&filter_page=2");
    const mesh = createMesh({ state: { ready: true } });

    mesh.urlState("products.filters", {
      search: "",
      page: 1
    }, {
      paramNames: (field) => `filter_${field}`
    });

    expect(mesh.getUrlState("products.filters")).toEqual({
      search: "keyboards",
      page: 2
    });

    mesh.setUrlState("products.filters", { search: "mice", page: 3 });
    expect(window.location.search).toContain("filter_search=mice");
    expect(window.location.search).toContain("filter_page=3");
  });

  it("captures dynamic unknown query params into a configured field", () => {
    window.history.replaceState(null, "", "/products?search=keyboard&filter_brand=acme&filter_rating=4&ignored=true");
    const mesh = createMesh({ state: { ready: true } });

    mesh.urlState("products.filters", {
      search: "",
      dynamic: {} as Record<string, string>
    }, {
      captureUnknown: /^filter_/,
      unknownField: "dynamic"
    });

    expect(mesh.getUrlState<{ search: string; dynamic: Record<string, string> }>("products.filters")).toEqual({
      search: "keyboard",
      dynamic: {
        filter_brand: "acme",
        filter_rating: "4"
      }
    });

    mesh.setUrlState("products.filters", {
      dynamic: {
        filter_brand: "contoso",
        filter_stock: "in"
      }
    });

    expect(window.location.search).toContain("filter_brand=contoso");
    expect(window.location.search).toContain("filter_stock=in");
    expect(window.location.search).not.toContain("filter_rating=");
    expect(window.location.search).toContain("ignored=true");
  });

  it("guards duplicate URL state registrations and allows explicit replacement", () => {
    window.history.replaceState(null, "", "/products");
    const mesh = createMesh({ state: { ready: true } });

    mesh.urlState("products.filters", { search: "" });
    expect(() => mesh.urlState("products.filters", { search: "" })).toThrow(DuplicateRegistrationError);

    mesh.urlState("products.filters", { search: "all" }, { replace: true });
    expect(mesh.getUrlState("products.filters")).toEqual({ search: "all" });
  });

  it("setUrlState with functional updater", () => {
    window.history.replaceState(null, "", "/products?search=keyboard&page=1");
    const mesh = createMesh({ state: { ready: true } });
    mesh.urlState("products.filters", { search: "", page: 1 });

    mesh.setUrlState("products.filters", (current) => ({
      ...current,
      page: (current.page as number) + 1
    }));

    expect(mesh.getUrlState("products.filters").page).toBe(2);
  });

  it("setUrlState with partial merge preserves other fields", () => {
    window.history.replaceState(null, "", "/products?search=keyboard&page=2&sale=true");
    const mesh = createMesh({ state: { ready: true } });
    mesh.urlState("products.filters", { search: "", page: 1, sale: false });

    mesh.setUrlState("products.filters", { search: "mice" });
    const state = mesh.getUrlState("products.filters");
    expect(state.search).toBe("mice");
    expect(state.page).toBe(2);
    expect(state.sale).toBe(true);
  });

  it("custom number serializer for URL state", () => {
    window.history.replaceState(null, "", "/products?page=5");
    const mesh = createMesh({ state: { ready: true } });
    mesh.urlState("products.filters", { page: 1 }, {
      serializers: { page: numberUrlSerializer }
    });
    expect(mesh.getUrlState<{ page: number }>("products.filters").page).toBe(5);
  });

  it("custom boolean serializer for URL state", () => {
    window.history.replaceState(null, "", "/products?sale=true");
    const mesh = createMesh({ state: { ready: true } });
    mesh.urlState("products.filters", { sale: false }, {
      serializers: { sale: booleanUrlSerializer }
    });
    expect(mesh.getUrlState<{ sale: boolean }>("products.filters").sale).toBe(true);
  });
});
