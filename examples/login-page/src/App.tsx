import {
  StateMeshProvider,
  createApiClient,
  createMesh,
  createSelector,
  useMeshAction,
  useMeshForm,
  useMeshSelector,
  useMeshMutation
} from "statemesh-core";

type User = {
  id: string;
  name: string;
  email: string;
};

type AuthState = {
  token: string | null;
  user: User | null;
  error: string | null;
};

type LoginValues = {
  email: string;
  password: string;
};

type LoginState = {
  auth: AuthState;
  ui: { view: "login" | "dashboard" };
};

// Memoized selectors — only recompute when their specific dependency changes.
// Components using these avoid re-rendering when unrelated state (e.g., ui.view) updates.
const selectIsAuthenticated = createSelector<LoginState, [string | null], boolean>(
  [(state) => state.auth.token],
  (token) => token !== null
);

const selectCurrentUser = createSelector<LoginState, [User | null], User | null>(
  [(state) => state.auth.user],
  (user) => user
);

const selectAuthError = createSelector<LoginState, [string | null], string | null>(
  [(state) => state.auth.error],
  (error) => error
);

export function createLoginExample() {
  const mesh = createMesh({
    name: "login-page",
    state: {
      auth: {
        token: null as string | null,
        user: null as User | null,
        error: null as string | null
      },
      ui: {
        view: "login" as "login" | "dashboard"
      }
    }
  });

  // API client with token injection — every authenticated request automatically
  // attaches the Bearer token via getAccessToken, and 401s trigger refreshAuth.
  const api = createApiClient({
    baseUrl: "/api",
    getAccessToken: () => mesh.getState().auth.token,
    refreshAuth: async () => {
      // In a real app this would call a refresh endpoint.
      // Here we just return the current token to keep the mock simple.
      return mesh.getState().auth.token ?? "";
    },
    async fetcher(input, init) {
      const url = new URL(String(input), "http://local.test");
      const path = url.pathname;

      if (path === "/api/auth/login") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.email === "admin@example.test" && body.password === "secret") {
          return Response.json({
            token: "eyJhbGciOiJIUzI1NiJ9.mock",
            user: { id: "user_1", name: "Admin", email: body.email } satisfies User
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

  // Logout action — synchronous state clear, no API dependency in the UI path.
  const logout = mesh.action("auth.logout", (state) => {
    state.auth.token = null;
    state.auth.user = null;
    state.auth.error = null;
    state.ui.view = "login";
  });

  // Login mutation — posts credentials, stores the result atomically.
  const loginMutation = mesh.mutation("auth.login", {
    async mutate(values: LoginValues) {
      return api.post<{ token: string; user: User }>("/auth/login", values);
    },
    optimistic(state) {
      state.auth.error = null;
    },
    commit(state, result) {
      // Batch: auth state + UI transition in one notification.
      mesh.batch(() => {
        state.auth.token = result.token;
        state.auth.user = result.user;
        state.auth.error = null;
        state.ui.view = "dashboard";
      });
    },
    onError(_error) {
      mesh.setPath("auth.error", "Invalid email or password");
    }
  });

  // Login form — client + server validation, blur-triggered, auto-clears server errors.
  mesh.form("auth.login.form", {
    initialValues: { email: "", password: "" } satisfies LoginValues,
    fields: {
      email(value: string) {
        if (!value.trim()) return "Email is required";
        if (!value.includes("@")) return "Enter a valid email address";
        return null;
      },
      password(value: string) {
        if (!value) return "Password is required";
        if (value.length < 6) return "Password must be at least 6 characters";
        return null;
      }
    },
    validateOnBlur: true,
    clearServerErrorOnChange: true,
    submit: loginMutation,
    mapServerErrors: () => ({ email: "Invalid email or password" } satisfies Partial<LoginValues>)
  });

  return { mesh, logout, loginMutation };
}

const example = createLoginExample();

function LoginForm() {
  const form = useMeshForm<LoginValues>("auth.login.form");

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

function Dashboard({ user }: { user: User }) {
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

  if (isAuthenticated && user !== null) {
    return <Dashboard user={user as User} />;
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
