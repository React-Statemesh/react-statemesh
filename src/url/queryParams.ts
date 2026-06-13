/** Convert a flat object into URL query params, omitting null, undefined, and empty-string values. */
export function toQueryParams(values: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== "") {
      params.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
  }
  return params;
}
