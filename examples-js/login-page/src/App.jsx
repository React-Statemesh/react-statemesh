import React from "react";
import {
  StateMeshProvider,
  createApiClient,
  createMesh,
  createSelector,
  useMeshAction,
  useMeshForm,
  useMeshSelector,
  useMeshMutation
} from "@statemesh/react";

const selectIsAuthenticated = createSelector(
  [(state) => state.auth.token],
  (token) => token !== null
);

const selectCurrentUser = createSelector(
  [(state) => state.auth.user],
  (user) => user
);

export function createLoginExample() {
  const mesh = createMesh({
    name: "login-page-js",
    state: {
      auth: {
        token: null,
        user: null,
        error: null
      },
      ui: {
        view: "login"
      }
    }
  });

  const api = createApiClient({
    baseUrl: "/api",
    getAccessToken: () => mesh.getState().auth.token,
    refreshAuth: async () => mesh.getState().auth.token ?? "",
    async fetcher(input, init) {
      const url = new URL(String(input), "http://local.test");
      const path = url.pathname;

      if (path === "/api/auth/login") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.email === "admin@example.test" && body.password === "secret") {
          return Response.json({
            token: "eyJhbGciOiJIUzI1NiJ9.mock",
            user: { id: "user_1", name: "Admin", email: body.email }
          });
        }
        return new Response(JSON.stringify({ message: "Invalid email or password" }), { status: 401 });
      }

      if (path === "/api/auth/logout") {
        return Response.json({ ok: true });
      }

      if (path === "/api/auth/me") {
        const auth = mesh.getState().auth;
        if (!auth.token) {
          return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
        }
        return Response.json(auth.user);
      }

      return Response.json({ ok: true });
    }
  });

  const logout = mesh.action("auth.logout", (state) => {
    state.auth.token = null;
    state.auth.user = null;
    state.auth.error = null;
    state.ui.view = "login";
  });

  const loginMutation = mesh.mutation("auth.login", {
    async mutate(values) {
      return api.post("/auth/login", values);
    },
    commit(state, result) {
      mesh.batch(() => {
        state.auth.token = result.token;
        state.auth.user = result.user;
        state.auth.error = null;
        state.ui.view = "dashboard";
      });
    },
    onError(state) {
      state.auth.error = "Invalid email or password";
    }
  });

  mesh.form("auth.login.form", {
    initialValues: { email: "", password: "" },
    fields: {
      email(value) {
        if (!value.trim()) return "Email is required";
        if (!value.includes("@")) return "Enter a valid email address";
        return null;
      },
      password(value) {
        if (!value) return "Password is required";
        if (value.length < 6) return "Password must be at least 6 characters";
        return null;
      }
    },
    validateOnBlur: true,
    clearServerErrorOnChange: true,
    submit: loginMutation,
    mapServerErrors: () => ({ email: "Invalid email or password" })
  });

  return { mesh, logout, loginMutation };
}

const example = createLoginExample();

function LoginForm() {
  const form = useMeshForm("auth.login.form");

  return (
    <section>
      <h1>Sign in</h1>
      <form onSubmit={(e) => void form.submit(e).catch(() => {})}>
        <div>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            {...form.field("email")}
          />
          {form.touched.email && form.errors.email && (
            <p role="alert">{form.errors.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            {...form.field("password")}
          />
          {form.touched.password && form.errors.password && (
            <p role="alert">{form.errors.password}</p>
          )}
        </div>

        {form.submitError && !form.touched.email && (
          <p role="alert">{form.errors.email}</p>
        )}

        <button type="submit" disabled={form.submitting}>
          {form.submitting ? "Logging in..." : "Log in"}
        </button>
      </form>
    </section>
  );
}

function Dashboard({ user }) {
  const logoutAction = useMeshAction(example.logout);

  return (
    <section>
      <h1>Welcome, {user.name}</h1>
      <p>Email: {user.email}</p>
      <button type="button" onClick={() => logoutAction()}>
        Log out
      </button>
    </section>
  );
}

function App() {
  const isAuthenticated = useMeshSelector(selectIsAuthenticated);
  const user = useMeshSelector(selectCurrentUser);

  if (isAuthenticated && user) {
    return <Dashboard user={user} />;
  }

  return <LoginForm />;
}

export default function Root() {
  return (
    <StateMeshProvider mesh={example.mesh}>
      <App />
    </StateMeshProvider>
  );
}
