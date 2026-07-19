import { StateMeshProvider, createMesh, useMeshUrlState } from "@statemesh/react";

const mesh = createMesh({
  name: "url-filters",
  state: {}
});

mesh.urlState("products.filters", {
  search: "",
  category: "all",
  page: 1,
  sort: "latest"
});

function ProductFilters() {
  const [filters, setFilters] = useMeshUrlState<{
    search: string;
    category: string;
    page: number;
    sort: string;
  }>("products.filters");

  return (
    <section>
      <input value={filters.search} onChange={(event) => setFilters({ search: event.target.value, page: 1 })} />
      <select value={filters.category} onChange={(event) => setFilters({ category: event.target.value, page: 1 })}>
        <option value="all">All</option>
        <option value="electronics">Electronics</option>
        <option value="fashion">Fashion</option>
      </select>
    </section>
  );
}

export default function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <ProductFilters />
    </StateMeshProvider>
  );
}
