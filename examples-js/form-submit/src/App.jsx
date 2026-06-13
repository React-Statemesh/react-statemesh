import { StateMeshProvider, createMesh, useMeshForm, useMeshSelector } from "react-statemesh";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mesh = createMesh({
  name: "form-submit-js",
  state: {
    user: null
  }
});

const updateProfileMutation = mesh.mutation("profile.update", {
  async mutate(values) {
    await wait(250);
    if (values.email === "taken@example.test") {
      throw new Error("Email conflict");
    }
    return { id: "user_1", ...values };
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
  fields: {
    name(value) {
      return value.trim() ? null : "Name is required";
    },
    async email(value) {
      await wait(150);
      if (!value.includes("@")) return "Valid email is required";
      return value === "taken@example.test" ? "Email is already taken" : null;
    }
  },
  validateOnBlur: true,
  submit: updateProfileMutation,
  mapServerErrors(error) {
    const cause = error.cause;
    return cause instanceof Error && cause.message === "Email conflict"
      ? { email: "Email is already taken" }
      : {};
  },
  autosave: {
    debounce: 600,
    validate: false,
    async submit(values) {
      await wait(100);
      console.info("Autosaved draft", values);
    },
    when(form) {
      return form.dirty && !form.submitting;
    }
  },
  steps: [
    { name: "profile", fields: ["name"] },
    { name: "contact", fields: ["email"] }
  ]
});

function ProfileForm() {
  const form = useMeshForm("profile.form");
  const user = useMeshSelector((state) => state.user);

  return (
    <main>
      <form onSubmit={(event) => void form.submit(event).catch(() => undefined)}>
        {form.currentStep === "profile" && (
          <label>
            Name
            <input {...form.field("name")} />
            {form.touched.name && form.errors.name && <span>{form.errors.name}</span>}
          </label>
        )}

        {form.currentStep === "contact" && (
          <label>
            Email
            <input {...form.field("email")} />
            {form.validatingFields.email && <span>Checking email...</span>}
            {form.errors.email && <span>{form.errors.email}</span>}
          </label>
        )}

        <div>
          <button type="button" disabled={form.stepIndex <= 0} onClick={form.previousStep}>
            Back
          </button>
          {form.currentStep === "profile" ? (
            <button type="button" onClick={() => void form.nextStep()}>
              Next
            </button>
          ) : (
            <button disabled={form.submitting}>{form.submitting ? "Saving..." : "Save"}</button>
          )}
        </div>

        {form.autosaving && <p>Saving draft...</p>}
        {form.dirty && !form.autosaving && <p>Unsaved changes</p>}
      </form>

      {user && (
        <section>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
          <button type="button" onClick={() => form.resetToServer(user)}>
            Reset to saved
          </button>
        </section>
      )}
    </main>
  );
}

export default function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <ProfileForm />
    </StateMeshProvider>
  );
}
