import { StateMeshProvider, createMesh, useMeshForm } from "react-statemesh";

const mesh = createMesh({
  name: "form-submit",
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
      ...(values.email.includes("@") ? {} : { email: "Valid email is required" })
    };
  },
  submit: "profile.update"
});

function ProfileForm() {
  const form = useMeshForm<{ name: string; email: string }>("profile.form");

  return (
    <form onSubmit={form.submit}>
      <input {...form.field("name")} />
      {form.errors.name && <p>{form.errors.name}</p>}
      <input {...form.field("email")} />
      {form.errors.email && <p>{form.errors.email}</p>}
      <button disabled={form.submitting}>{form.submitting ? "Saving..." : "Save"}</button>
    </form>
  );
}

export default function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <ProfileForm />
    </StateMeshProvider>
  );
}
