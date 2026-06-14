import { describe, expect, it } from "vitest";
import { DuplicateRegistrationError, createMesh } from "../../src";

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
});
