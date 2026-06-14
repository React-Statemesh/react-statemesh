import { useEffect, useMemo, useState } from "react";
import type { Mesh, MeshEvent } from "../core/types";
import { formatEvent } from "./eventFormatter";

/** Props for the lightweight in-app StateMesh devtools timeline. */
export type StateMeshDevtoolsProps<TState = unknown> = {
  /** Mesh instance to inspect. */
  mesh: Mesh<TState>;
  /** Number of events retained in the panel. Defaults to 100. */
  limit?: number;
  /** Hide the panel without removing event collection. */
  hidden?: boolean;
  /** Initial event category filter. Defaults to all events. */
  initialCategory?: DevtoolsEventCategory | "all";
  /** Called when the user exports the visible events. */
  onExport?: (events: MeshEvent[]) => void;
};

export type DevtoolsEventCategory =
  | "state"
  | "action"
  | "transaction"
  | "resource"
  | "mutation"
  | "form"
  | "url"
  | "persist"
  | "sync"
  | "api"
  | "mesh";

/** Lightweight in-app devtools timeline for development builds. */
export function StateMeshDevtools<TState = unknown>({
  mesh,
  limit = 100,
  hidden = false,
  initialCategory = "all",
  onExport
}: StateMeshDevtoolsProps<TState>) {
  const [events, setEvents] = useState<MeshEvent[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DevtoolsEventCategory | "all">(initialCategory);
  const [failedOnly, setFailedOnly] = useState(false);

  useEffect(() => {
    return mesh.onEvent((event) => {
      setEvents((current) => [...current.slice(Math.max(0, current.length - limit + 1)), event]);
    });
  }, [mesh, limit]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...events]
      .filter((event) => category === "all" || getEventCategory(event) === category)
      .filter((event) => !failedOnly || event.type.includes("failed") || event.type.includes("error"))
      .filter((event) => !normalizedQuery || formatEvent(event).toLowerCase().includes(normalizedQuery))
      .reverse();
  }, [events, category, failedOnly, query]);

  if (hidden) return null;

  return (
    <aside style={panelStyle} aria-label="StateMesh DevTools">
      <header style={headerStyle}>
        <strong>StateMesh</strong>
        <div style={actionsStyle}>
          <button type="button" style={buttonStyle} onClick={() => (onExport ? onExport(rows) : copyEvents(rows))}>
            Export
          </button>
          <button type="button" style={buttonStyle} onClick={() => setEvents([])}>
            Clear
          </button>
        </div>
      </header>
      <div style={toolbarStyle}>
        <input
          aria-label="Search StateMesh events"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          style={inputStyle}
        />
        <select
          aria-label="Filter StateMesh events"
          value={category}
          onChange={(event) => setCategory(event.target.value as DevtoolsEventCategory | "all")}
          style={selectStyle}
        >
          <option value="all">All</option>
          {eventCategories.map((candidate) => (
            <option key={candidate} value={candidate}>{candidate}</option>
          ))}
        </select>
        <label style={checkboxStyle}>
          <input type="checkbox" checked={failedOnly} onChange={(event) => setFailedOnly(event.target.checked)} />
          Failed
        </label>
      </div>
      <ol style={listStyle}>
        {rows.map((event, index) => (
          <li key={`${event.type}-${event.timestamp}-${index}`} style={rowStyle}>
            <code>{formatEvent(event)}</code>
            <time style={timeStyle}>{new Date(event.timestamp).toLocaleTimeString()}</time>
          </li>
        ))}
      </ol>
    </aside>
  );
}

const eventCategories: DevtoolsEventCategory[] = [
  "state",
  "action",
  "transaction",
  "resource",
  "mutation",
  "form",
  "url",
  "persist",
  "sync",
  "api",
  "mesh"
];

function getEventCategory(event: MeshEvent): DevtoolsEventCategory {
  return event.type.split(".")[0] as DevtoolsEventCategory;
}

function copyEvents(events: MeshEvent[]): void {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(JSON.stringify(events, null, 2));
}

const panelStyle = {
  position: "fixed",
  right: 12,
  bottom: 12,
  width: 360,
  maxWidth: "calc(100vw - 24px)",
  maxHeight: 420,
  overflow: "hidden",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  background: "#ffffff",
  color: "#18181b",
  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.16)",
  font: "12px system-ui, sans-serif",
  zIndex: 2147483647
} as const;

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 10px",
  borderBottom: "1px solid #e4e4e7"
} as const;

const actionsStyle = {
  display: "flex",
  gap: 6
} as const;

const toolbarStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 116px auto",
  gap: 6,
  alignItems: "center",
  padding: "8px 10px",
  borderBottom: "1px solid #e4e4e7"
} as const;

const buttonStyle = {
  border: "1px solid #d4d4d8",
  borderRadius: 6,
  background: "#fafafa",
  padding: "3px 8px",
  cursor: "pointer"
} as const;

const inputStyle = {
  minWidth: 0,
  border: "1px solid #d4d4d8",
  borderRadius: 6,
  padding: "4px 6px",
  font: "12px system-ui, sans-serif"
} as const;

const selectStyle = {
  border: "1px solid #d4d4d8",
  borderRadius: 6,
  padding: "4px 6px",
  background: "#ffffff",
  font: "12px system-ui, sans-serif"
} as const;

const checkboxStyle = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  color: "#52525b"
} as const;

const listStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  maxHeight: 360,
  overflow: "auto"
} as const;

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
  padding: "7px 10px",
  borderBottom: "1px solid #f4f4f5"
} as const;

const timeStyle = {
  color: "#71717a"
} as const;
