export type RouteMeta = {
  /** Page title. */
  title?: string;
  /** Meta description. */
  description?: string;
  /** Open Graph image URL. */
  ogImage?: string;
  /** Open Graph type. */
  ogType?: string;
  /** Canonical URL. */
  canonical?: string;
  /** Additional meta tags. */
  [key: string]: unknown;
};

/**
 * Update document meta tags from route metadata.
 */
export function updateDocumentMeta(meta: RouteMeta): void {
  if (typeof document === "undefined") return;

  // Title
  if (meta.title) {
    document.title = meta.title;
  }

  // Description
  setMetaTag("description", meta.description);

  // Open Graph
  setMetaProperty("og:title", meta.title);
  setMetaProperty("og:description", meta.description);
  setMetaProperty("og:image", meta.ogImage);
  setMetaProperty("og:type", meta.ogType);

  // Canonical
  if (meta.canonical) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", meta.canonical);
  }

  // Additional meta tags
  for (const [key, value] of Object.entries(meta)) {
    if (["title", "description", "ogImage", "ogType", "canonical"].includes(key)) continue;
    if (typeof value === "string") {
      setMetaTag(key, value);
    }
  }
}

function setMetaTag(name: string, content: string | undefined): void {
  if (!content) return;
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

function setMetaProperty(property: string, content: string | undefined): void {
  if (!content) return;
  let meta = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}
