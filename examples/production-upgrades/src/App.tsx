import {
  StateMeshProvider,
  createApiClient,
  createMesh,
  useMeshAction,
  useMeshForm,
  useMeshResource,
  useMeshUrlState
} from "statemesh-core";

type Product = {
  id: string;
  name: string;
  category: string;
};

export type Filters = {
  search: string;
  page: number;
  dynamic: Record<string, string>;
};

type SettingsValues = {
  alerts: boolean;
  plan: "free" | "pro" | "enterprise";
  country: string;
  avatar: File | null;
};

type AuditEntry = {
  id: string;
  action: string;
  timestamp: number;
};

const products: Product[] = [
  { id: "keyboard", name: "Keyboard", category: "hardware" },
  { id: "mouse", name: "Mouse", category: "hardware" },
  { id: "stand", name: "Laptop Stand", category: "desk" }
];

export function createProductionUpgradesExample() {
  const mesh = createMesh({
    name: "production-upgrades",
    state: {
      user: {
        role: "admin" as "admin" | "viewer"
      },
      exports: 0
    }
  });

  const api = createApiClient({
    baseUrl: "/api",
    async fetcher(input) {
      const url = new URL(String(input), "http://local.test");
      if (url.pathname === "/api/products") {
        const search = url.searchParams.get("q") ?? "";
        return Response.json(products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase())));
      }
      if (url.pathname === "/api/audit") {
        return Response.json({
          entries: [
            { id: "audit_1", action: "reports.export", timestamp: Date.now() - 60000 },
            { id: "audit_2", action: "settings.updated", timestamp: Date.now() - 30000 }
          ] satisfies AuditEntry[]
        });
      }
      return Response.json({ ok: true });
    }
  });

  mesh.urlState("products.filters", {
    search: "",
    page: 1,
    dynamic: {}
  } satisfies Filters, {
    paramNames: {
      search: "q",
      page: "p"
    },
    captureUnknown: /^filter_/,
    unknownField: "dynamic"
  });

  const productsResource = mesh.resource("products.search", {
    key: (filters: Filters) => ["products", filters],
    staleTime: "1m",
    async fetch(filters: Filters, ctx) {
      return api.get<Product[]>("/products", {
        query: {
          q: filters.search,
          page: filters.page
        },
        signal: ctx.signal
      });
    },
    tags: ["products"]
  });

  // Resource with a bounded cache — limits memory usage for high-churn data.
  // Only 5 entries are kept; oldest unused entries are evicted first.
  const auditResource = mesh.resource("audit.log", {
    staleTime: "30s",
    maxCacheEntries: 5,
    key: () => "recent",
    async fetch(_: void, ctx) {
      return api.get<{ entries: AuditEntry[] }>("/api/audit", { signal: ctx.signal });
    },
    tags: ["audit"]
  });

  const exportReport = mesh.action("reports.export", (state) => {
    state.exports += 1;
  });

  mesh.guard({ kind: "action", name: "reports.export" }, ({ state }) => ({
    allow: state.user.role === "admin",
    reason: "Admin role is required to export reports."
  }));

  mesh.form<SettingsValues>("settings.form", {
    initialValues: {
      alerts: true,
      plan: "pro",
      country: "IN",
      avatar: null
    },
    submit(values) {
      mesh.setPath("user.role", values.plan === "enterprise" ? "admin" : "viewer");
    }
  });

  return {
    mesh,
    productsResource,
    exportReport,
    auditResource
  };
}

const example = createProductionUpgradesExample();

function ProductsPanel() {
  const [filters, setFilters] = useMeshUrlState<Filters>("products.filters");
  const productsQuery = useMeshResource(example.productsResource, filters, {
    keepPreviousData: true,
    placeholderData: [],
    select: (data) => data ?? []
  });

  return (
    <section>
      <input
        aria-label="Search products"
        value={filters.search}
        onChange={(event) => setFilters({ search: event.target.value, page: 1 })}
      />
      <p>Captured filters: {Object.keys(filters.dynamic).join(",") || "none"}</p>
      {productsQuery.fetching ? <p>Refreshing products</p> : null}
      <ul>
        {productsQuery.data?.map((product) => (
          <li key={product.id}>{product.name}</li>
        ))}
      </ul>
    </section>
  );
}

function SettingsPanel() {
  const form = useMeshForm<SettingsValues>("settings.form");

  return (
    <form onSubmit={(event) => void form.submit(event)}>
      <label>
        <input type="checkbox" {...form.checkbox("alerts")} />
        Alerts
      </label>
      <label>
        <input type="radio" {...form.radio("plan", "pro")} />
        Pro
      </label>
      <label>
        <input type="radio" {...form.radio("plan", "enterprise")} />
        Enterprise
      </label>
      <select aria-label="Country" {...form.select("country")}>
        <option value="IN">India</option>
        <option value="US">United States</option>
      </select>
      <input aria-label="Avatar" type="file" {...form.file("avatar")} />
      <button type="submit" disabled={form.submitting}>Save settings</button>
    </form>
  );
}

function ExportButton() {
  const exportReport = useMeshAction(example.exportReport);

  return <button onClick={() => exportReport()}>Export report</button>;
}

export default function App() {
  return (
    <StateMeshProvider mesh={example.mesh}>
      <main>
        <ProductsPanel />
        <SettingsPanel />
        <ExportButton />
      </main>
    </StateMeshProvider>
  );
}
