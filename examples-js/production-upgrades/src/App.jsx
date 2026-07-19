import React from "react";
import {
  StateMeshProvider,
  createApiClient,
  createMesh,
  useMeshAction,
  useMeshForm,
  useMeshResource,
  useMeshUrlState
} from "statemesh-core";

const products = [
  { id: "keyboard", name: "Keyboard", category: "hardware" },
  { id: "mouse", name: "Mouse", category: "hardware" },
  { id: "stand", name: "Laptop Stand", category: "desk" }
];

export function createProductionUpgradesExample() {
  const mesh = createMesh({
    name: "production-upgrades-js",
    state: {
      user: {
        role: "admin"
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
      return Response.json({ ok: true });
    }
  });

  mesh.urlState("products.filters", {
    search: "",
    page: 1,
    dynamic: {}
  }, {
    paramNames: {
      search: "q",
      page: "p"
    },
    captureUnknown: /^filter_/,
    unknownField: "dynamic"
  });

  const productsResource = mesh.resource("products.search", {
    key: (filters) => ["products", filters],
    staleTime: "1m",
    async fetch(filters, ctx) {
      return api.get("/products", {
        query: {
          q: filters.search,
          page: filters.page
        },
        signal: ctx.signal
      });
    },
    tags: ["products"]
  });

  const exportReport = mesh.action("reports.export", (state) => {
    state.exports += 1;
  });

  mesh.guard({ kind: "action", name: "reports.export" }, ({ state }) => ({
    allow: state.user.role === "admin",
    reason: "Admin role is required to export reports."
  }));

  mesh.form("settings.form", {
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
    exportReport
  };
}

const example = createProductionUpgradesExample();

function ProductsPanel() {
  const [filters, setFilters] = useMeshUrlState("products.filters");
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
  const form = useMeshForm("settings.form");

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
