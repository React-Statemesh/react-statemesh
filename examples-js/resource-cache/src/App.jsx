import { StateMeshProvider, createApiClient, createMesh, useMeshMutation, useMeshResource } from "statemesh-core";

const mesh = createMesh({
  name: "resource-cache-js",
  state: {
    ui: {
      search: ""
    }
  }
});

const api = createApiClient({
  baseUrl: "/api",
  async fetcher(input) {
    const url = new URL(String(input), "http://local.test");
    if (url.pathname === "/api/products") {
      return Response.json([
        { id: "keyboard", name: "Keyboard" },
        { id: "mouse", name: "Mouse" }
      ]);
    }
    return Response.json({ id: "stand", name: "Laptop Stand" });
  }
});

const productsResource = mesh.resource("products.list", {
  key: (filters) => ["products", filters],
  staleTime: "1m",
  async fetch(filters) {
    const products = await api.get("/products", { query: filters });
    return products.filter((product) => product.name.toLowerCase().includes(filters.search.toLowerCase()));
  },
  tags: [{ type: "products" }]
});

const createProductMutation = mesh.mutation("products.create", {
  optimistic(_state, input, context) {
    context.setResourceData(productsResource, { search: "" }, (current) => [
      { id: "temp", name: input.name, optimistic: true },
      ...(current ?? [])
    ]);
  },
  async mutate(input) {
    return api.post("/products", input);
  },
  invalidate: [{ type: "products" }],
  refetch: "active"
});

function Products() {
  const products = useMeshResource(productsResource, { search: "" });
  const createProduct = useMeshMutation(createProductMutation);

  return (
    <main>
      <button disabled={createProduct.pending} onClick={() => createProduct.run({ name: "Laptop Stand" })}>
        {createProduct.pending ? "Creating..." : "Create product"}
      </button>
      {products.pending ? <p>Loading...</p> : null}
      {products.error ? <button onClick={() => products.refetch()}>Retry</button> : null}
      <ul>
        {products.data?.map((product) => (
          <li key={product.id}>{product.name}{product.optimistic ? " (saving)" : ""}</li>
        ))}
      </ul>
    </main>
  );
}

export default function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <Products />
    </StateMeshProvider>
  );
}
