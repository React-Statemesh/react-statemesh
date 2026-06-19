import { useEffect, useMemo, useState } from "react";
import type {
  Mesh,
  MeshDoctorOptions,
  MeshDoctorReport,
  MeshEvent,
  MeshProfilerSample
} from "../core/types";
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
  /** Show the performance profiler tab. */
  showProfiler?: boolean;
  /** Show the StateMesh Doctor tab. */
  showDoctor?: boolean;
  /** Options passed to `mesh.doctor()`. */
  doctorOptions?: MeshDoctorOptions;
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
  onExport,
  showProfiler = false,
  showDoctor = false,
  doctorOptions
}: StateMeshDevtoolsProps<TState>) {
  const [events, setEvents] = useState<MeshEvent[]>([]);
  const [profilerSamples, setProfilerSamples] = useState<MeshProfilerSample[]>(() => mesh.getProfilerSamples());
  const [view, setView] = useState<"events" | "profiler" | "doctor">("events");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DevtoolsEventCategory | "all">(initialCategory);
  const [failedOnly, setFailedOnly] = useState(false);
  const [profilerQuery, setProfilerQuery] = useState("");
  const [slowOnly, setSlowOnly] = useState(false);
  const [doctorVersion, setDoctorVersion] = useState(0);

  useEffect(() => {
    return mesh.onEvent((event) => {
      setEvents((current) => [...current.slice(Math.max(0, current.length - limit + 1)), event]);
    });
  }, [mesh, limit]);

  useEffect(() => {
    setProfilerSamples(mesh.getProfilerSamples());
    return mesh.subscribeProfiler(() => {
      setProfilerSamples(mesh.getProfilerSamples());
    });
  }, [mesh]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...events]
      .filter((event) => category === "all" || getEventCategory(event) === category)
      .filter((event) => !failedOnly || event.type.includes("failed") || event.type.includes("error"))
      .filter((event) => !normalizedQuery || formatEvent(event).toLowerCase().includes(normalizedQuery))
      .reverse();
  }, [events, category, failedOnly, query]);

  const profilerRows = useMemo(() => {
    const normalizedQuery = profilerQuery.trim().toLowerCase();
    return [...profilerSamples]
      .filter((sample) => !slowOnly || sample.slow)
      .filter((sample) => !normalizedQuery || `${sample.kind} ${sample.name} ${sample.status}`.toLowerCase().includes(normalizedQuery))
      .reverse();
  }, [profilerSamples, profilerQuery, slowOnly]);

  const doctorReport = useMemo(
    () => mesh.doctor(doctorOptions),
    [mesh, events.length, profilerSamples.length, doctorVersion, doctorOptions]
  );

  if (hidden) return null;

  return (
    <aside style={panelStyle} aria-label="StateMesh DevTools">
      <header style={headerStyle}>
        <div style={titleStyle}>
          <strong>StateMesh</strong>
          <nav style={tabsStyle} aria-label="StateMesh DevTools views">
            <button type="button" style={view === "events" ? activeTabStyle : tabStyle} onClick={() => setView("events")}>
              Events
            </button>
            {showProfiler ? (
              <button type="button" style={view === "profiler" ? activeTabStyle : tabStyle} onClick={() => setView("profiler")}>
                Profiler
              </button>
            ) : null}
            {showDoctor ? (
              <button type="button" style={view === "doctor" ? activeTabStyle : tabStyle} onClick={() => setView("doctor")}>
                Doctor
              </button>
            ) : null}
          </nav>
        </div>
        <div style={actionsStyle}>
          <button type="button" style={buttonStyle} onClick={() => {
            if (view === "events") {
              if (onExport) onExport(rows);
              else copyJson(rows);
            } else if (view === "profiler") {
              copyJson(profilerRows);
            } else {
              copyJson(doctorReport);
            }
          }}>
            Export
          </button>
          {view !== "doctor" ? (
            <button type="button" style={buttonStyle} onClick={() => {
              if (view === "events") setEvents([]);
              else mesh.clearProfilerSamples();
            }}>
              Clear
            </button>
          ) : (
            <button type="button" style={buttonStyle} onClick={() => setDoctorVersion((current) => current + 1)}>
              Refresh
            </button>
          )}
        </div>
      </header>
      {view === "events" ? (
        <>
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
          <EventRows rows={rows} />
        </>
      ) : null}
      {view === "profiler" ? (
        <>
          <div style={profilerToolbarStyle}>
            <input
              aria-label="Search StateMesh profiler"
              value={profilerQuery}
              onChange={(event) => setProfilerQuery(event.target.value)}
              placeholder="Search operations"
              style={inputStyle}
            />
            <label style={checkboxStyle}>
              <input type="checkbox" checked={slowOnly} onChange={(event) => setSlowOnly(event.target.checked)} />
              Slow
            </label>
          </div>
          <ProfilerRows rows={profilerRows} />
        </>
      ) : null}
      {view === "doctor" ? <DoctorRows report={doctorReport} /> : null}
    </aside>
  );
}

function EventRows({ rows }: { rows: MeshEvent[] }) {
  return (
    <ol style={listStyle}>
      {rows.map((event, index) => (
        <li key={`${event.type}-${event.timestamp}-${index}`} style={rowStyle}>
          <code>{formatEvent(event)}</code>
          <time style={timeStyle}>{new Date(event.timestamp).toLocaleTimeString()}</time>
        </li>
      ))}
    </ol>
  );
}

function ProfilerRows({ rows }: { rows: MeshProfilerSample[] }) {
  return (
    <ol style={listStyle}>
      {rows.map((sample) => (
        <li key={sample.id} style={rowStyle}>
          <code>{sample.kind}.{sample.name} [{sample.status}]</code>
          <strong style={sample.slow ? slowTimeStyle : timeStyle}>{sample.duration}ms</strong>
        </li>
      ))}
    </ol>
  );
}

function DoctorRows({ report }: { report: MeshDoctorReport }) {
  return (
    <div>
      <div style={doctorSummaryStyle}>
        <span>Errors: {report.summary.errors}</span>
        <span>Warnings: {report.summary.warnings}</span>
        <span>Info: {report.summary.info}</span>
      </div>
      <ol style={listStyle}>
        {report.issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.name ?? "mesh"}-${index}`} style={doctorRowStyle}>
            <strong>{issue.level.toUpperCase()} {issue.code}</strong>
            <span>{issue.message}</span>
          </li>
        ))}
      </ol>
    </div>
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

function copyJson(value: unknown): void {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(JSON.stringify(value, null, 2));
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
  gap: 8,
  padding: "8px 10px",
  borderBottom: "1px solid #e4e4e7"
} as const;

const titleStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0
} as const;

const tabsStyle = {
  display: "flex",
  gap: 2
} as const;

const tabStyle = {
  border: 0,
  borderRadius: 4,
  background: "transparent",
  color: "#71717a",
  padding: "3px 5px",
  cursor: "pointer",
  font: "11px system-ui, sans-serif"
} as const;

const activeTabStyle = {
  ...tabStyle,
  background: "#e4e4e7",
  color: "#18181b"
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

const profilerToolbarStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
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

const slowTimeStyle = {
  color: "#b91c1c"
} as const;

const doctorSummaryStyle = {
  display: "flex",
  gap: 12,
  padding: "8px 10px",
  borderBottom: "1px solid #e4e4e7",
  color: "#52525b"
} as const;

const doctorRowStyle = {
  display: "grid",
  gap: 4,
  padding: "8px 10px",
  borderBottom: "1px solid #f4f4f5"
} as const;
