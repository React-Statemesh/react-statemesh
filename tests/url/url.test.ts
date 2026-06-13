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

  it("guards duplicate URL state registrations and allows explicit replacement", () => {
    window.history.replaceState(null, "", "/products");
    const mesh = createMesh({ state: { ready: true } });

    mesh.urlState("products.filters", { search: "" });
    expect(() => mesh.urlState("products.filters", { search: "" })).toThrow(DuplicateRegistrationError);

    mesh.urlState("products.filters", { search: "all" }, { replace: true });
    expect(mesh.getUrlState("products.filters")).toEqual({ search: "all" });
  });
});
