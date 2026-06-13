import { describe, expect, it } from "vitest";
import { DuplicateRegistrationError, createMesh } from "../../src";

describe("forms", () => {
  it("tracks dirty/touched state, validates, and submits through a transaction", async () => {
    const mesh = createMesh({
      state: {
        user: null as null | { name: string; email: string }
      }
    });

    mesh.transaction("profile.update", {
      async effect(_state, values: { name: string; email: string }) {
        return values;
      },
      commit(state, user) {
        state.user = user;
      }
    });

    mesh.form("profile.form", {
      initialValues: {
        name: "",
        email: ""
      },
      validate(values) {
        return {
          ...(values.name ? {} : { name: "Name is required" }),
          ...(String(values.email).includes("@") ? {} : { email: "Valid email is required" })
        };
      },
      submit: "profile.update"
    });

    const form = mesh.getForm<{ name: string; email: string }>("profile.form");
    form.setValue("name", "Ada");
    form.setValue("email", "ada@example.test");

    expect(mesh.getForm("profile.form").dirty).toBe(true);

    await mesh.getForm("profile.form").submit();
    expect(mesh.getState().user).toEqual({ name: "Ada", email: "ada@example.test" });
    expect(mesh.getForm("profile.form").submitted).toBe(true);
  });

  it("guards duplicate form registrations and allows explicit replacement", () => {
    const mesh = createMesh({ state: {} });

    mesh.form("profile.form", {
      initialValues: { name: "" }
    });
    expect(() =>
      mesh.form("profile.form", {
        initialValues: { name: "" }
      })
    ).toThrow(DuplicateRegistrationError);

    mesh.form("profile.form", {
      initialValues: { name: "Ada" }
    }, { replace: true });

    expect(mesh.getForm<{ name: string }>("profile.form").values).toEqual({ name: "Ada" });
  });
});
