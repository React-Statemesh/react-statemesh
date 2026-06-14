import { describe, expect, it, vi } from "vitest";
import { DuplicateRegistrationError, createMesh, zodSchema } from "../../src";

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

  it("runs field-level async validation and tracks validating fields", async () => {
    const mesh = createMesh({ state: {} });

    mesh.form("signup.form", {
      initialValues: { email: "" },
      fields: {
        async email(value) {
          await Promise.resolve();
          return String(value).includes("@") ? null : "Valid email is required";
        }
      }
    });

    const validation = mesh.getForm<{ email: string }>("signup.form").validateField("email");
    expect(mesh.getForm<{ email: string }>("signup.form").validatingFields.email).toBe(true);

    await expect(validation).resolves.toBe("Valid email is required");
    expect(mesh.getForm<{ email: string }>("signup.form").errors.email).toBe("Valid email is required");
    expect(mesh.getForm<{ email: string }>("signup.form").validating).toBe(false);
  });

  it("stores server errors and clears the changed field by default", () => {
    const mesh = createMesh({ state: {} });

    mesh.form("profile.form", {
      initialValues: { email: "" }
    });

    const form = mesh.getForm<{ email: string }>("profile.form");
    form.setServerErrors({ email: "Email is already taken" });

    expect(mesh.getForm<{ email: string }>("profile.form").serverErrors.email).toBe("Email is already taken");
    expect(mesh.getForm<{ email: string }>("profile.form").errors.email).toBe("Email is already taken");

    form.setServerErrors({});
    expect(mesh.getForm<{ email: string }>("profile.form").serverErrors.email).toBeUndefined();
    expect(mesh.getForm<{ email: string }>("profile.form").errors.email).toBeUndefined();

    form.setServerErrors({ email: "Email is already taken" });
    form.setValue("email", "ada@example.test");

    expect(mesh.getForm<{ email: string }>("profile.form").serverErrors.email).toBeUndefined();
    expect(mesh.getForm<{ email: string }>("profile.form").errors.email).toBeUndefined();
  });

  it("provides checkbox, radio, file, and select field helpers", async () => {
    const mesh = createMesh({ state: {} });
    mesh.form("preferences.form", {
      initialValues: {
        accepted: false,
        plan: "free",
        avatar: null as File | File[] | null,
        country: ""
      },
      fields: {
        accepted(value) {
          return value ? null : "Must accept";
        }
      }
    });

    const form = mesh.getForm<{
      accepted: boolean;
      plan: string;
      avatar: File | File[] | null;
      country: string;
    }>("preferences.form");

    form.checkbox("accepted").onChange({ target: { checked: true } });
    form.radio("plan", "pro").onChange();
    const avatar = new File(["avatar"], "avatar.png", { type: "image/png" });
    form.file("avatar").onChange({ target: { files: [avatar] } });
    form.select("country").onChange({ target: { value: "IN" } });

    const values = mesh.getForm<{
      accepted: boolean;
      plan: string;
      avatar: File | File[] | null;
      country: string;
    }>("preferences.form").values;

    expect(values.accepted).toBe(true);
    expect(values.plan).toBe("pro");
    expect(values.avatar).toBe(avatar);
    expect(values.country).toBe("IN");
    expect(mesh.getForm("preferences.form").dirty).toBe(true);

    mesh.getForm<{ accepted: boolean }>("preferences.form").checkbox("accepted").onChange(false);
    mesh.getForm<{ accepted: boolean }>("preferences.form").checkbox("accepted").onBlur();
    await Promise.resolve();
    expect(mesh.getForm<{ accepted: boolean }>("preferences.form").errors.accepted).toBe("Must accept");
  });

  it("ignores stale async field validation results", async () => {
    const mesh = createMesh({ state: {} });
    const pending: Array<{ value: string; resolve: (error: string | null) => void }> = [];

    mesh.form("signup.form", {
      initialValues: { email: "" },
      fields: {
        email(value) {
          return new Promise((resolve) => {
            pending.push({ value, resolve });
          });
        }
      }
    });

    mesh.getForm<{ email: string }>("signup.form").setValue("email", "bad");
    const first = mesh.getForm<{ email: string }>("signup.form").validateField("email");

    mesh.getForm<{ email: string }>("signup.form").setValue("email", "ada@example.test");
    const second = mesh.getForm<{ email: string }>("signup.form").validateField("email");

    expect(pending.map((validation) => validation.value)).toEqual(["bad", "ada@example.test"]);

    pending[1]?.resolve(null);
    await expect(second).resolves.toBeNull();
    expect(mesh.getForm<{ email: string }>("signup.form").errors.email).toBeUndefined();

    pending[0]?.resolve("Valid email is required");
    await expect(first).resolves.toBeNull();
    expect(mesh.getForm<{ email: string }>("signup.form").errors.email).toBeUndefined();
  });

  it("submits through a mutation handle and maps failed server validation", async () => {
    const mesh = createMesh({
      state: {
        savedUser: null as null | { id: string; name: string; email: string }
      }
    });

    const saveProfile = mesh.mutation<
      { name: string; email: string },
      { id: string; name: string; email: string }
    >("profile.save", {
      async mutate(values) {
        if (values.email === "taken@example.test") {
          throw new Error("Email conflict");
        }
        return { id: "user_1", ...values };
      },
      commit(state, user) {
        state.savedUser = user;
      }
    });

    mesh.form("profile.form", {
      initialValues: { name: "Ada", email: "taken@example.test" },
      submit: saveProfile,
      mapServerErrors(error) {
        const cause = (error as Error & { cause?: unknown }).cause;
        return cause instanceof Error && cause.message === "Email conflict" ? { email: "Email is already taken" } : {};
      }
    });

    await expect(mesh.getForm<{ name: string; email: string }>("profile.form").submit()).rejects.toThrow("profile.save");
    expect(mesh.getForm<{ name: string; email: string }>("profile.form").serverErrors.email).toBe("Email is already taken");

    mesh.getForm<{ name: string; email: string }>("profile.form").setValue("email", "ada@example.test");
    await mesh.getForm<{ name: string; email: string }>("profile.form").submit();

    expect(mesh.getState().savedUser).toEqual({ id: "user_1", name: "Ada", email: "ada@example.test" });
    expect(saveProfile.success).toBe(true);
  });

  it("autosaves dirty values through a debounced submitter", async () => {
    vi.useFakeTimers();
    try {
      const mesh = createMesh({ state: {} });
      const saves: Array<{ title: string }> = [];

      mesh.form("draft.form", {
        initialValues: { title: "" },
        autosave: {
          debounce: 25,
          validate: false,
          async submit(values) {
            saves.push({ ...values });
          }
        }
      });

      mesh.getForm<{ title: string }>("draft.form").setValue("title", "Quarterly plan");

      expect(saves).toEqual([]);
      await vi.advanceTimersByTimeAsync(25);

      expect(saves).toEqual([{ title: "Quarterly plan" }]);
      expect(mesh.getForm<{ title: string }>("draft.form").autosaveError).toBeNull();
      expect(mesh.getForm<{ title: string }>("draft.form").autosavedAt).toEqual(expect.any(Number));
    } finally {
      vi.useRealTimers();
    }
  });

  it("tracks dirty fields deeply and resets to server data", () => {
    const mesh = createMesh({ state: {} });

    mesh.form("settings.form", {
      initialValues: {
        name: "Ada",
        preferences: { tags: ["math"] }
      }
    });

    const form = mesh.getForm<{ name: string; preferences: { tags: string[] } }>("settings.form");
    form.setValue("preferences", { tags: ["math"] });
    expect(mesh.getForm("settings.form").dirty).toBe(false);

    form.setValue("name", "Grace");
    expect(mesh.getForm<{ name: string; preferences: { tags: string[] } }>("settings.form").dirtyFields.name).toBe(true);
    expect(mesh.getForm("settings.form").dirty).toBe(true);

    form.resetToServer({
      name: "Grace",
      preferences: { tags: ["compiler"] }
    });

    expect(mesh.getForm("settings.form").dirty).toBe(false);
    expect(mesh.getForm<{ name: string; preferences: { tags: string[] } }>("settings.form").initialValues).toEqual({
      name: "Grace",
      preferences: { tags: ["compiler"] }
    });
  });

  it("supports multi-step forms with per-step validation", async () => {
    const mesh = createMesh({ state: {} });

    mesh.form("wizard.form", {
      initialValues: { name: "", email: "" },
      fields: {
        name(value) {
          return value ? null : "Name is required";
        },
        email(value) {
          return String(value).includes("@") ? null : "Valid email is required";
        }
      },
      steps: [
        { name: "profile", fields: ["name"] },
        { name: "contact", fields: ["email"] }
      ]
    });

    expect(mesh.getForm("wizard.form").currentStep).toBe("profile");
    await expect(mesh.getForm("wizard.form").nextStep()).resolves.toBe(false);
    expect(mesh.getForm<{ name: string; email: string }>("wizard.form").errors.name).toBe("Name is required");
    expect(mesh.getForm("wizard.form").currentStep).toBe("profile");

    mesh.getForm<{ name: string; email: string }>("wizard.form").setValue("name", "Ada");
    await expect(mesh.getForm("wizard.form").nextStep()).resolves.toBe(true);
    expect(mesh.getForm("wizard.form").currentStep).toBe("contact");

    mesh.getForm("wizard.form").previousStep();
    expect(mesh.getForm("wizard.form").currentStep).toBe("profile");
  });

  it("supports schema adapters and field arrays", async () => {
    const mesh = createMesh({ state: {} });

    mesh.form("invoice.form", {
      initialValues: {
        customer: "",
        items: [] as Array<{ id: string; label: string }>
      },
      schema: zodSchema({
        safeParse(values) {
          return values.customer
            ? { success: true }
            : {
                success: false,
                error: {
                  issues: [{ path: ["customer"], message: "Customer is required" }]
                }
              };
        }
      })
    });

    const form = mesh.getForm<{ customer: string; items: Array<{ id: string; label: string }> }>("invoice.form");
    form.fieldArray("items").append({ id: "1", label: "Design" });
    form.fieldArray("items").insert(1, { id: "2", label: "Build" });
    form.fieldArray("items").move(0, 1);

    expect(mesh.getForm<{ customer: string; items: Array<{ id: string; label: string }> }>("invoice.form").values.items).toEqual([
      { id: "2", label: "Build" },
      { id: "1", label: "Design" }
    ]);
    expect(mesh.getForm("invoice.form").dirty).toBe(true);

    await expect(mesh.getForm("invoice.form").validate()).resolves.toEqual({ customer: "Customer is required" });

    form.setValue("customer", "Ada");
    form.fieldArray("items").remove(0);
    await expect(mesh.getForm("invoice.form").validate()).resolves.toEqual({});
    expect(mesh.getForm<{ customer: string; items: Array<{ id: string; label: string }> }>("invoice.form").values.items).toEqual([
      { id: "1", label: "Design" }
    ]);
  });
});
