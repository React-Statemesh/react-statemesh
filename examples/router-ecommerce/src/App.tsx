import { Suspense } from "react";
import {
  StateMeshProvider,
  createMesh,
  createApiClient,
  createSelector,
  useMeshSelector,
  useMeshAction,
  useSuspenseMeshResource
} from "react-statemesh";
import {
  defineRoutes,
  redirect,
  RouterProvider,
  Outlet,
  Link,
  useNavigate,
  useMatch,
  useParams,
  useSearch,
  SharedElement,
  updateDocumentMeta,
  backoff
} from "react-statemesh/router";

// ============================================================================
// Types
// ============================================================================

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  description: string;
  category: string;
};

type CartItem = Product & { quantity: number };

type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "customer";
};

type Order = {
  id: string;
  items: CartItem[];
  total: number;
  status: "pending" | "confirmed" | "shipped" | "delivered";
  createdAt: string;
};

// ============================================================================
// Mesh Setup
// ============================================================================

const mesh = createMesh({
  name: "ecommerce",
  state: {
    auth: {
      user: null as User | null,
      token: null as string | null
    },
    cart: {
      items: [] as CartItem[],
      coupon: null as string | null
    },
    ui: {
      theme: "light" as "light" | "dark",
      toast: null as { message: string; severity: "success" | "error" } | null
    }
  }
});

// ============================================================================
// API Client
// ============================================================================

const api = createApiClient({
  baseUrl: "/api",
  getAccessToken: () => mesh.getState().auth.token,
  refreshAuth: async () => {
    // Refresh the token if it expires
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json();
    mesh.setPath("auth.token", data.token);
    return data.token;
  },
  retry: {
    attempts: 2,
    delay: backoff({ base: 500, max: 5000, jitter: true }),
    retryOn: [408, 429, 500, 502, 503]
  },
  timeout: 10000
});

// ============================================================================
// Selectors
// ============================================================================

const selectCartTotal = createSelector(
  [(state: { cart: { items: CartItem[] } }) => state.cart.items],
  (items) => items.reduce((sum, item) => sum + item.price * item.quantity, 0)
);

const selectCartCount = createSelector(
  [(state: { cart: { items: CartItem[] } }) => state.cart.items],
  (items) => items.reduce((count, item) => count + item.quantity, 0)
);

const selectIsAuthenticated = createSelector(
  [(state: { auth: { token: string | null } }) => state.auth.token],
  (token) => token !== null
);

// ============================================================================
// Resources
// ============================================================================

const productsResource = mesh.resource("products.list", {
  key: (params: { category?: string; search?: string }) => ["products", params],
  staleTime: "1m",
  cacheTime: "10m",
  maxCacheEntries: 20,
  tags: [{ type: "products" }],
  async fetch(params, ctx) {
    return api.get<Product[]>("/products", {
      query: params,
      signal: ctx.signal
    });
  },
  onSuccess: (data) => {
    console.log(`[products] Loaded ${data.length} products`);
  }
});

const productDetailResource = mesh.resource("product.detail", {
  key: (params: { id: string }) => ["product", params.id],
  staleTime: "5m",
  tags: [{ type: "products" }],
  async fetch(params, ctx) {
    return api.get<Product>(`/products/${params.id}`, { signal: ctx.signal });
  },
  enabled: (params) => params.id !== ""
});

const orderResource = mesh.resource("order.detail", {
  key: (params: { id: string }) => ["order", params.id],
  staleTime: "30s",
  tags: [{ type: "orders" }],
  async fetch(params, ctx) {
    return api.get<Order>(`/orders/${params.id}`, { signal: ctx.signal });
  }
});

const userOrdersResource = mesh.resource("user.orders", {
  key: () => ["user-orders"],
  staleTime: "1m",
  tags: [{ type: "orders" }],
  async fetch(_, ctx) {
    return api.get<Order[]>("/orders", { signal: ctx.signal });
  },
  enabled: (_, state) => state.auth.token !== null
});

// ============================================================================
// Actions
// ============================================================================

const addToCart = mesh.action("cart.add", (state, product: Product) => {
  const existing = state.cart.items.find((item) => item.id === product.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.items.push({ ...product, quantity: 1 });
  }
});

const removeFromCart = mesh.action("cart.remove", (state, productId: string) => {
  state.cart.items = state.cart.items.filter((item) => item.id !== productId);
});

const clearCart = mesh.action("cart.clear", (state) => {
  state.cart.items = [];
  state.cart.coupon = null;
});

const showToast = mesh.action("ui.toast", (state, toast: { message: string; severity: "success" | "error" }) => {
  state.ui.toast = toast;
});

const dismissToast = mesh.action("ui.toast.dismiss", (state) => {
  state.ui.toast = null;
});

// ============================================================================
// Mutations
// ============================================================================

const loginMutation = mesh.mutation("auth.login", {
  async mutate(values: { email: string; password: string }) {
    return api.post<{ token: string; user: User }>("/auth/login", values);
  },
  commit(state, result) {
    state.auth.token = result.token;
    state.auth.user = result.user;
  },
  onError(_error) {
    mesh.setPath("auth.error", "Invalid credentials");
  }
});

const checkoutMutation = mesh.mutation("order.checkout", {
  async mutate(values: { paymentMethod: string }) {
    const cart = mesh.getState().cart;
    return api.post<Order>("/orders", {
      items: cart.items,
      coupon: cart.coupon,
      paymentMethod: values.paymentMethod
    });
  },
  optimistic(state) {
    state.ui.toast = { message: "Processing your order...", severity: "success" };
  },
  commit(state, order) {
    state.cart.items = [];
    state.cart.coupon = null;
    state.ui.toast = { message: `Order ${order.id} confirmed!`, severity: "success" };
  },
  onError(state) {
    state.ui.toast = { message: "Checkout failed. Please try again.", severity: "error" };
  },
  invalidate: [{ type: "orders" }]
});

// ============================================================================
// Form
// ============================================================================

mesh.form("login.form", {
  initialValues: { email: "", password: "" },
  fields: {
    email(value: string) {
      if (!value.trim()) return "Email is required";
      if (!value.includes("@")) return "Enter a valid email";
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
  mapServerErrors: () => ({ email: "Invalid email or password" })
});

mesh.form("checkout.form", {
  initialValues: {
    address: "",
    city: "",
    zip: "",
    paymentMethod: "card"
  },
  fields: {
    address(value: string) {
      return value.trim() ? null : "Address is required";
    },
    city(value: string) {
      return value.trim() ? null : "City is required";
    },
    zip(value: string) {
      return /^\d{5}$/.test(value) ? null : "Enter a valid 5-digit ZIP";
    }
  },
  validateOnBlur: true,
  submit: checkoutMutation
});

// ============================================================================
// Route Definitions
// ============================================================================

const routes = defineRoutes([
  {
    // Home page — product catalog
    path: "/",
    component: () => import("./pages/Home"),
    loader: async ({ mesh, search }) => {
      return productsResource.fetch({ category: search.category as string });
    },
    meta: {
      title: "ShopDesk — Modern E-Commerce",
      description: "Browse our collection of keyboards, mice, and accessories."
    },
    dependencies: {
      // Prefetch the featured product in parallel
      featured: (_, mesh) => productDetailResource.fetch({ id: "keyboard-pro" })
    }
  },
  {
    // Product catalog with search/filter
    path: "/products",
    component: () => import("./pages/Products"),
    loader: async ({ search, mesh, signal }) => {
      return productsResource.fetch({
        category: search.category as string,
        search: search.q as string
      }, { signal });
    },
    meta: ({ search }) => ({
      title: search.q ? `Search: ${search.q} — ShopDesk` : "Products — ShopDesk"
    }),
    children: [
      {
        // Product detail — nested under /products
        path: ":id",
        component: () => import("./pages/ProductDetail"),
        loader: async ({ params, mesh, signal }) => {
          return productDetailResource.fetch({ id: params.id }, { signal });
        },
        meta: ({ loaderData }) => ({
          title: `${(loaderData as Product).name} — ShopDesk`,
          description: (loaderData as Product).description,
          ogImage: (loaderData as Product).image,
          ogType: "product"
        }),
        // Error recovery — retry 3 times with backoff before showing error
        errorRecovery: {
          retry: 3,
          retryDelay: backoff({ base: 1000, max: 10000 }),
          fallbackComponent: () => import("./pages/ProductLoading"),
          onError: (error, attempt) => {
            console.warn(`Product load failed (attempt ${attempt}):`, error.message);
            return attempt < 3 ? "retry" : "fallback";
          }
        }
      }
    ]
  },
  {
    // Cart — keep alive so form state survives navigation
    path: "/cart",
    component: () => import("./pages/Cart"),
    keepAlive: true,
    meta: { title: "Cart — ShopDesk" }
  },
  {
    // Checkout — protected route with rollback on failure
    path: "/checkout",
    component: () => import("./pages/Checkout"),
    pendingComponent: () => import("./pages/CheckoutLoading"),
    errorComponent: () => import("./pages/CheckoutError"),
    meta: { requiresAuth: true, title: "Checkout — ShopDesk" },
    rollback: true,
    loader: async ({ mesh, signal }) => {
      // This will redirect to /login if not authenticated (via beforeEach guard)
      // If the loader fails, the navigation rolls back — user stays on /cart
      const cart = mesh.getState().cart;
      if (cart.items.length === 0) {
        throw redirect("/cart");
      }
      return { items: cart.items, total: cart.items.reduce((s, i) => s + i.price * i.quantity, 0) };
    }
  },
  {
    // Order confirmation — protected
    path: "/orders/:id",
    component: () => import("./pages/OrderConfirmation"),
    loader: async ({ params, mesh, signal }) => {
      return orderResource.fetch({ id: params.id }, { signal });
    },
    meta: ({ params }) => ({
      title: `Order ${params.id} — ShopDesk`
    }),
    dependencies: {
      // Also prefetch the user's order list
      orders: (_, mesh) => userOrdersResource.fetch()
    }
  },
  {
    // User orders — protected, with state scope for form preservation
    path: "/account/orders",
    component: () => import("./pages/UserOrders"),
    loader: async ({ mesh, signal }) => {
      return userOrdersResource.fetch(undefined, { signal });
    },
    meta: { title: "My Orders — ShopDesk" }
  },
  {
    // Login page
    path: "/login",
    component: () => import("./pages/Login"),
    meta: { title: "Sign In — ShopDesk" }
  },
  {
    // 404 catch-all
    path: "*",
    component: () => import("./pages/NotFound"),
    meta: { title: "Page Not Found — ShopDesk" }
  }
]);

// ============================================================================
// Router
// ============================================================================

const router = mesh.router(routes, {
  basename: "",
  scrollRestoration: true,
  preload: "intent",

  // Keep up to 5 routes alive in memory
  keepAlive: {
    maxRoutes: 5,
    evictionStrategy: "lru"
  },

  // Learn which routes users visit next and prefetch them
  predictivePrefetch: {
    enabled: true,
    topN: 2,
    minProbability: 0.3
  },

  // Track page views, time on page, and scroll depth
  analytics: {
    enabled: true,
    trackPageViews: true,
    trackTimeOnPage: true,
    trackScrollDepth: true,
    trackNavigationFunnels: true,
    onEvent: (event) => {
      // Send to your analytics provider
      console.log(`[analytics] ${event.name}`, event.properties);
    }
  }
});

// ============================================================================
// Route Middleware
// ============================================================================

// Auth guard — redirect to login for protected routes
router.beforeEach((to, _from, context) => {
  if (to.meta.requiresAuth && !context.mesh.getState().auth.token) {
    throw redirect("/login", { search: { returnTo: to.fullPath } });
  }
});

// Analytics middleware — fire page view on every navigation
router.use(async (to, from, next) => {
  updateDocumentMeta(to.meta);
  return next();
});

// ============================================================================
// Components
// ============================================================================

function AppShell() {
  const cartCount = useMeshSelector(selectCartCount);
  const isAuthenticated = useMeshSelector(selectIsAuthenticated);
  const toast = useMeshSelector((state: { ui: { toast: { message: string; severity: string } | null } }) => state.ui.toast);
  const dismiss = useMeshAction(dismissToast);

  return (
    <div className="app">
      {/* Navigation bar — always visible */}
      <nav className="navbar">
        <Link to="/" className="logo">ShopDesk</Link>
        <div className="nav-links">
          <Link to="/products" preload>Products</Link>
          <Link to="/cart">
            Cart {cartCount > 0 && <span className="badge">{cartCount}</span>}
          </Link>
          {isAuthenticated ? (
            <Link to="/account/orders">My Orders</Link>
          ) : (
            <Link to="/login">Sign In</Link>
          )}
        </div>
      </nav>

      {/* Toast notifications */}
      {toast && (
        <div className={`toast toast-${toast.severity}`}>
          {toast.message}
          <button onClick={() => dismiss()}>×</button>
        </div>
      )}

      {/* Route content — Outlet renders the matched route's component */}
      <main className="content">
        <Suspense fallback={<div className="loading">Loading...</div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

// ============================================================================
// Page Components
// ============================================================================

function Home() {
  const products = useSuspenseMeshResource(productsResource, {});
  const add = useMeshAction(addToCart);

  return (
    <section>
      <h1>Welcome to ShopDesk</h1>
      <div className="product-grid">
        {products.data?.map((product) => (
          <div key={product.id} className="product-card">
            {/* SharedElement enables smooth transition to detail page */}
            <Link to="/products/:id" params={{ id: product.id }}>
              <SharedElement id={`product-image-${product.id}`}>
                <img src={product.image} alt={product.name} />
              </SharedElement>
              <h3>{product.name}</h3>
            </Link>
            <p>${product.price}</p>
            <button onClick={() => add(product)}>Add to Cart</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Products() {
  const [search, setSearch] = useSearch();
  const products = useSuspenseMeshResource(productsResource, {
    category: search.category as string,
    search: search.q as string
  });

  return (
    <section>
      <h1>Products</h1>
      <input
        type="search"
        placeholder="Search products..."
        value={(search.q as string) ?? ""}
        onChange={(e) => setSearch({ q: e.target.value })}
      />
      <div className="product-grid">
        {products.data?.map((product) => (
          <Link key={product.id} to="/products/:id" params={{ id: product.id }} preload>
            <SharedElement id={`product-image-${product.id}`}>
              <img src={product.image} alt={product.name} />
            </SharedElement>
            <h3>{product.name}</h3>
            <p>${product.price}</p>
          </Link>
        ))}
      </div>
      {/* Nested route renders here via Outlet */}
      <Outlet />
    </section>
  );
}

function ProductDetail() {
  const { id } = useParams();
  const product = useSuspenseMeshResource(productDetailResource, { id });
  const add = useMeshAction(addToCart);
  const navigate = useNavigate();

  return (
    <div className="product-detail">
      <SharedElement id={`product-image-${id}`}>
        <img src={product.data.image} alt={product.data.name} className="hero" />
      </SharedElement>
      <h1>{product.data.name}</h1>
      <p className="price">${product.data.price}</p>
      <p>{product.data.description}</p>
      <button onClick={() => {
        add(product.data);
        showToast({ message: `${product.data.name} added to cart`, severity: "success" });
      }}>
        Add to Cart
      </button>
      <button onClick={() => navigate("/cart")}>Go to Cart</button>
    </div>
  );
}

function Cart() {
  const items = useMeshSelector((state: { cart: { items: CartItem[] } }) => state.cart.items);
  const total = useMeshSelector(selectCartTotal);
  const remove = useMeshAction(removeFromCart);
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <section>
        <h1>Your Cart</h1>
        <p>Cart is empty.</p>
        <Link to="/products">Browse Products</Link>
      </section>
    );
  }

  return (
    <section>
      <h1>Your Cart</h1>
      {items.map((item) => (
        <div key={item.id} className="cart-item">
          <span>{item.name} × {item.quantity}</span>
          <span>${item.price * item.quantity}</span>
          <button onClick={() => remove(item.id)}>Remove</button>
        </div>
      ))}
      <div className="cart-total">
        <strong>Total: ${total}</strong>
      </div>
      <button onClick={() => navigate("/checkout")}>Proceed to Checkout</button>
    </section>
  );
}

function Checkout() {
  const match = useMatch();
  const navigate = useNavigate();

  // The checkout form uses mesh.form — it's persisted via keepAlive
  return (
    <section>
      <h1>Checkout</h1>
      <form onSubmit={(e) => {
        e.preventDefault();
        // Form submission is handled by the mesh form system
      }}>
        <label>
          Address
          <input type="text" name="address" />
        </label>
        <label>
          City
          <input type="text" name="city" />
        </label>
        <label>
          ZIP Code
          <input type="text" name="zip" />
        </label>
        <button type="submit">Place Order</button>
      </form>
    </section>
  );
}

function Login() {
  const match = useMatch();
  const search = match?.search as { returnTo?: string } | undefined;

  return (
    <section>
      <h1>Sign In</h1>
      <form onSubmit={(e) => e.preventDefault()}>
        <label>
          Email
          <input type="email" name="email" />
        </label>
        <label>
          Password
          <input type="password" name="password" />
        </label>
        <button type="submit">Sign In</button>
      </form>
    </section>
  );
}

function OrderConfirmation() {
  const { id } = useParams();
  const order = useSuspenseMeshResource(orderResource, { id });

  return (
    <section>
      <h1>Order Confirmed!</h1>
      <p>Order ID: {order.data.id}</p>
      <p>Status: {order.data.status}</p>
      <p>Total: ${order.data.total}</p>
    </section>
  );
}

function UserOrders() {
  const orders = useSuspenseMeshResource(userOrdersResource);

  return (
    <section>
      <h1>My Orders</h1>
      {orders.data?.map((order) => (
        <Link key={order.id} to="/orders/:id" params={{ id: order.id }}>
          <div className="order-card">
            <span>Order {order.id}</span>
            <span>${order.total}</span>
            <span>{order.status}</span>
          </div>
        </Link>
      ))}
    </section>
  );
}

function NotFound() {
  return (
    <section>
      <h1>404 — Page Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <Link to="/">Go Home</Link>
    </section>
  );
}

// ============================================================================
// App Entry
// ============================================================================

export default function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <RouterProvider router={router} mesh={mesh} routes={routes}>
        <AppShell />
      </RouterProvider>
    </StateMeshProvider>
  );
}
