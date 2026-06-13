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
};

/** Lightweight in-app devtools timeline for development builds. */
export function StateMeshDevtools<TState = unknown>({
  mesh,
  limit = 100,
  hidden = false
}: StateMeshDevtoolsProps<TState>) {
  const [events, setEvents] = useState<MeshEvent[]>([]);

  useEffect(() => {
    return mesh.onEvent((event) => {
      setEvents((current) => [...current.slice(Math.max(0, current.length - limit + 1)), event]);
    });
  }, [mesh, limit]);

  const rows = useMemo(() => [...events].reverse(), [events]);

  if (hidden) return null;

  return (
    <aside style={panelStyle} aria-label="StateMesh DevTools">
      <header style={headerStyle}>
        <strong>StateMesh</strong>
        <button type="button" style={buttonStyle} onClick={() => setEvents([])}>
          Clear
        </button>
      </header>
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

const buttonStyle = {
  border: "1px solid #d4d4d8",
  borderRadius: 6,
  background: "#fafafa",
  padding: "3px 8px",
  cursor: "pointer"
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
