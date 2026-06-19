import { useEffect, useMemo, useState } from "react";
import type {
  Mesh,
  MeshDevtoolsComponentNode,
  MeshDevtoolsSnapshot,
  MeshDoctorOptions,
  MeshDoctorReport,
  MeshEvent,
  MeshPath,
  MeshProfilerSample
} from "../core/types";
import { formatEvent } from "./eventFormatter";

/** Props for the in-app StateMesh DevTools dock. */
export type StateMeshDevtoolsProps<TState = unknown> = {
  /** Mesh instance to inspect. */
  mesh: Mesh<TState>;
  /** Number of events retained in the panel. Defaults to 200. */
  limit?: number;
  /** Hide the panel without removing event collection. */
  hidden?: boolean;
  /** Initial event category filter. Defaults to all events. */
  initialCategory?: DevtoolsEventCategory | "all";
  /** Called when the user exports the visible events from the Events tab. */
  onExport?: (events: MeshEvent[]) => void;
  /** Called when the user exports the full debug report. Defaults to copying JSON. */
  onExportDebugReport?: (report: StateMeshDebugReport) => void;
  /** Show the performance profiler tab. Defaults to true. */
  showProfiler?: boolean;
  /** Show the StateMesh Doctor tab. Defaults to true. */
  showDoctor?: boolean;
  /** Options passed to `mesh.doctor()` when rendering the Doctor tab. */
  doctorOptions?: MeshDoctorOptions;
  /** Open the bottom dock on first render. Defaults to true. */
  defaultOpen?: boolean;
  /** Initial dock tab. Defaults to overview. */
  defaultView?: DevtoolsView;
  /** Normal dock height in pixels. Defaults to 420. */
  dockHeight?: number;
  /** Maximized dock height. Defaults to 82vh. */
  maximizedHeight?: number | string;
  /** Mask state/form/url/resource/mutation paths before rendering or exporting. */
  mask?: readonly MeshPath[];
  /** Maximum JSON preview bytes for large values. Defaults to 2000. */
  previewBytes?: number;
  /** Include state in snapshots and debug reports. Defaults to true. */
  includeState?: boolean;
};

export type DevtoolsView =
  | "overview"
  | "state"
  | "actions"
  | "resources"
  | "mutations"
  | "forms"
  | "url"
  | "components"
  | "profiler"
  | "doctor"
  | "events";

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

export type StateMeshDebugReport = {
  type: "react-statemesh.debug-report";
  version: 1;
  exportedAt: number;
  snapshot: MeshDevtoolsSnapshot;
  events: MeshEvent[];
};

/** Bottom-docked StateMesh DevTools for development and QA builds. */
export function StateMeshDevtools<TState = unknown>({
  mesh,
  limit = 200,
  hidden = false,
  initialCategory = "all",
  onExport,
  onExportDebugReport,
  showProfiler = true,
  showDoctor = true,
  doctorOptions,
  defaultOpen = true,
  defaultView = "overview",
  dockHeight = 420,
  maximizedHeight = "82vh",
  mask,
  previewBytes = 2_000,
  includeState = true
}: StateMeshDevtoolsProps<TState>) {
  const [open, setOpen] = useState(defaultOpen);
  const [maximized, setMaximized] = useState(false);
  const [view, setView] = useState<DevtoolsView>(defaultView);
  const [events, setEvents] = useState<MeshEvent[]>([]);
  const [snapshot, setSnapshot] = useState<MeshDevtoolsSnapshot>(() =>
    mesh.getDevtoolsSnapshot({ mask, previewBytes, state: includeState })
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DevtoolsEventCategory | "all">(initialCategory);
  const [failedOnly, setFailedOnly] = useState(false);
  const [profilerQuery, setProfilerQuery] = useState("");
  const [slowOnly, setSlowOnly] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [doctorVersion, setDoctorVersion] = useState(0);

  useEffect(() => {
    return mesh.onEvent((event) => {
      setEvents((current) => [...current.slice(Math.max(0, current.length - limit + 1)), event]);
    });
  }, [mesh, limit]);

  useEffect(() => {
    const readSnapshot = () => {
      setSnapshot(mesh.getDevtoolsSnapshot({ mask, previewBytes, state: includeState }));
    };
    readSnapshot();
    return mesh.subscribeDevtools(readSnapshot);
  }, [mesh, mask, previewBytes, includeState]);

  const tabs = useMemo(
    () => createTabs(showProfiler, showDoctor),
    [showProfiler, showDoctor]
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.value === view)) setView("overview");
  }, [tabs, view]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...events]
      .filter((event) => category === "all" || getEventCategory(event) === category)
      .filter((event) => !failedOnly || isFailedEvent(event))
      .filter((event) => !normalizedQuery || formatEvent(event).toLowerCase().includes(normalizedQuery))
      .reverse();
  }, [events, category, failedOnly, query]);

  const actionRows = useMemo(
    () => {
      const normalizedQuery = query.trim().toLowerCase();
      return [...events]
        .filter((event) => getEventCategory(event) === "action" || getEventCategory(event) === "transaction")
        .filter((event) => !failedOnly || isFailedEvent(event))
        .filter((event) => !normalizedQuery || formatEvent(event).toLowerCase().includes(normalizedQuery))
        .reverse();
    },
    [events, failedOnly, query]
  );

  const profilerRows = useMemo(() => {
    const normalizedQuery = profilerQuery.trim().toLowerCase();
    return [...snapshot.profiler]
      .filter((sample) => !slowOnly || sample.slow)
      .filter((sample) => !normalizedQuery || `${sample.kind} ${sample.name} ${sample.status}`.toLowerCase().includes(normalizedQuery))
      .reverse();
  }, [snapshot.profiler, profilerQuery, slowOnly]);

  const doctorReport = useMemo(
    () => mesh.doctor(doctorOptions),
    [mesh, snapshot.generatedAt, doctorOptions, doctorVersion]
  );

  const selectedComponent = useMemo(
    () => snapshot.components.find((component) => component.id === selectedComponentId) ?? snapshot.components[0] ?? null,
    [snapshot.components, selectedComponentId]
  );

  const debugReport = useMemo<StateMeshDebugReport>(
    () => ({
      type: "react-statemesh.debug-report",
      version: 1,
      exportedAt: Date.now(),
      snapshot,
      events
    }),
    [snapshot, events]
  );

  if (hidden) return null;

  if (!open) {
    return (
      <button type="button" style={launcherStyle} onClick={() => setOpen(true)} aria-label="Open StateMesh DevTools">
        <strong>StateMesh</strong>
        <span style={launcherMetaStyle}>
          {snapshot.summary.doctorErrors > 0 ? `${snapshot.summary.doctorErrors} errors` : `${events.length} events`}
        </span>
      </button>
    );
  }

  const height = maximized ? maximizedHeight : dockHeight;

  return (
    <aside style={{ ...dockStyle, height: typeof height === "number" ? `${height}px` : height }} aria-label="StateMesh DevTools">
      <header style={headerStyle}>
        <div style={brandStyle}>
          <strong style={brandTitleStyle}>StateMesh</strong>
          <span style={brandMetaStyle}>{mesh.name}</span>
        </div>
        <nav style={tabsStyle} aria-label="StateMesh DevTools views">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              style={view === tab.value ? activeTabStyle : tabStyle}
              onClick={() => setView(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div style={actionsStyle}>
          <button type="button" style={buttonStyle} onClick={() => exportDebugReport(debugReport, onExportDebugReport)}>
            Export
          </button>
          <button type="button" style={buttonStyle} onClick={() => setMaximized((current) => !current)}>
            {maximized ? "Dock" : "Max"}
          </button>
          <button type="button" style={buttonStyle} onClick={() => setOpen(false)}>
            Min
          </button>
        </div>
      </header>
      <section style={bodyStyle}>
        {view === "overview" ? <OverviewPanel snapshot={snapshot} events={events} /> : null}
        {view === "state" ? <StatePanel snapshot={snapshot} /> : null}
        {view === "actions" ? <TimelinePanel rows={actionRows} title="Actions & Transactions" /> : null}
        {view === "resources" ? <ResourcesPanel mesh={mesh} snapshot={snapshot} /> : null}
        {view === "mutations" ? <MutationsPanel mesh={mesh} snapshot={snapshot} /> : null}
        {view === "forms" ? <FormsPanel snapshot={snapshot} /> : null}
        {view === "url" ? <JsonPanel title="URL State" value={snapshot.urlStates} /> : null}
        {view === "components" ? (
          <ComponentsPanel
            components={snapshot.components}
            selected={selectedComponent}
            onSelect={(componentId) => setSelectedComponentId(componentId)}
          />
        ) : null}
        {view === "profiler" ? (
          <ProfilerPanel
            rows={profilerRows}
            query={profilerQuery}
            slowOnly={slowOnly}
            onQueryChange={setProfilerQuery}
            onSlowOnlyChange={setSlowOnly}
            onClear={() => mesh.clearProfilerSamples()}
          />
        ) : null}
        {view === "doctor" ? (
          <DoctorPanel report={doctorReport} onRefresh={() => setDoctorVersion((current) => current + 1)} />
        ) : null}
        {view === "events" ? (
          <EventsPanel
            rows={rows}
            query={query}
            category={category}
            failedOnly={failedOnly}
            onQueryChange={setQuery}
            onCategoryChange={setCategory}
            onFailedOnlyChange={setFailedOnly}
            onClear={() => setEvents([])}
            onExport={() => {
              if (onExport) onExport(rows);
              else copyJson(rows);
            }}
          />
        ) : null}
      </section>
    </aside>
  );
}

function OverviewPanel({ snapshot, events }: { snapshot: MeshDevtoolsSnapshot; events: MeshEvent[] }) {
  const metrics = [
    ["State Keys", snapshot.summary.stateKeys],
    ["Resources", snapshot.summary.resources],
    ["Stale", snapshot.summary.staleResources],
    ["Resource Errors", snapshot.summary.resourceErrors],
    ["Mutations", snapshot.summary.activeMutations],
    ["Queued", snapshot.summary.queuedMutations],
    ["Forms", snapshot.summary.forms],
    ["Form Errors", snapshot.summary.formErrors],
    ["Components", snapshot.summary.components],
    ["Slow Ops", snapshot.summary.slowOperations],
    ["Doctor Errors", snapshot.summary.doctorErrors],
    ["Warnings", snapshot.summary.doctorWarnings]
  ] as const;
  const recent = [...events].slice(-6).reverse();

  return (
    <div style={panelGridStyle}>
      <div style={metricsGridStyle}>
        {metrics.map(([label, value]) => (
          <div key={label} style={metricStyle}>
            <span style={metricLabelStyle}>{label}</span>
            <strong style={metricValueStyle}>{value}</strong>
          </div>
        ))}
      </div>
      <div style={splitGridStyle}>
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Doctor</h3>
          <DoctorRows report={snapshot.doctor} compact />
        </section>
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Recent Events</h3>
          <EventRows rows={recent} />
        </section>
      </div>
    </div>
  );
}

function StatePanel({ snapshot }: { snapshot: MeshDevtoolsSnapshot }) {
  return <JsonPanel title="State Snapshot" value={snapshot.state ?? null} />;
}

function ResourcesPanel<TState>({ mesh, snapshot }: { mesh: Mesh<TState>; snapshot: MeshDevtoolsSnapshot }) {
  return (
    <div style={tablePanelStyle}>
      <div style={panelHeaderStyle}>
        <strong>Resource Cache</strong>
        <span style={mutedStyle}>{snapshot.resources.length} entries</span>
      </div>
      <ol style={listStyle}>
        {snapshot.resources.map((resource) => (
          <li key={resource.key} style={wideRowStyle}>
            <div style={rowMainStyle}>
              <strong>{resource.name}</strong>
              <StatusBadge status={resource.status} />
              <span style={mutedStyle}>{resource.subscribers} subscribers</span>
              {resource.stale ? <span style={warningTextStyle}>stale</span> : null}
            </div>
            <div style={rowMetaStyle}>
              <code>{resource.key}</code>
              <span>{resource.duration ?? 0}ms</span>
              <span>{resource.tags.join(", ") || "no tags"}</span>
            </div>
            <JsonBlock value={resource.preview} compact />
            <div style={rowActionsStyle}>
              <button type="button" style={buttonStyle} onClick={() => {
                mesh.invalidateResources({
                  predicate: (status) => status.key === resource.key,
                  refetch: true,
                  metadata: { source: "devtools.refetch" }
                }).catch(() => undefined);
              }}>
                Refetch
              </button>
              <button type="button" style={buttonStyle} onClick={() => {
                mesh.invalidateResources({
                  predicate: (status) => status.key === resource.key,
                  metadata: { source: "devtools.invalidate" }
                }).catch(() => undefined);
              }}>
                Invalidate
              </button>
              <button type="button" style={buttonStyle} onClick={() => copyJson(resource)}>
                Copy
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MutationsPanel<TState>({ mesh, snapshot }: { mesh: Mesh<TState>; snapshot: MeshDevtoolsSnapshot }) {
  return (
    <div style={tablePanelStyle}>
      <div style={panelHeaderStyle}>
        <strong>Mutations</strong>
        <div style={rowActionsStyle}>
          <button type="button" style={buttonStyle} onClick={() => mesh.runQueuedMutations().catch(() => undefined)}>
            Flush Queue
          </button>
          <button type="button" style={buttonStyle} onClick={() => mesh.clearQueuedMutations()}>
            Clear Queue
          </button>
        </div>
      </div>
      <ol style={listStyle}>
        {snapshot.mutations.map((mutation) => (
          <li key={mutation.name} style={wideRowStyle}>
            <div style={rowMainStyle}>
              <strong>{mutation.name}</strong>
              <StatusBadge status={mutation.status} />
              <span style={mutedStyle}>{mutation.runs} runs</span>
              <span style={mutedStyle}>{mutation.queueSize} queued</span>
            </div>
            <JsonBlock value={{ data: mutation.data, lastPayload: mutation.lastPayload, error: mutation.error }} compact />
            <div style={rowActionsStyle}>
              <button type="button" style={buttonStyle} onClick={() => mesh.resetMutation(mutation.name)}>
                Reset
              </button>
              <button type="button" style={buttonStyle} onClick={() => copyJson(mutation)}>
                Copy
              </button>
            </div>
          </li>
        ))}
      </ol>
      {snapshot.queuedMutations.length > 0 ? <JsonPanel title="Offline Queue" value={snapshot.queuedMutations} /> : null}
    </div>
  );
}

function FormsPanel({ snapshot }: { snapshot: MeshDevtoolsSnapshot }) {
  return (
    <div style={tablePanelStyle}>
      <div style={panelHeaderStyle}>
        <strong>Forms</strong>
        <span style={mutedStyle}>{snapshot.forms.length} registered</span>
      </div>
      <ol style={listStyle}>
        {snapshot.forms.map((form) => (
          <li key={form.name} style={wideRowStyle}>
            <div style={rowMainStyle}>
              <strong>{form.name}</strong>
              {form.submitting ? <StatusBadge status="submitting" /> : null}
              {form.autosaving ? <StatusBadge status="autosaving" /> : null}
              {form.currentStep ? <span style={mutedStyle}>step {form.stepIndex + 1}: {form.currentStep}</span> : null}
            </div>
            <JsonBlock value={{ values: form.values, errors: form.errors, serverErrors: form.serverErrors, dirtyFields: form.dirtyFields, touched: form.touched }} compact />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ComponentsPanel({
  components,
  selected,
  onSelect
}: {
  components: MeshDevtoolsComponentNode[];
  selected: MeshDevtoolsComponentNode | null;
  onSelect: (componentId: string) => void;
}) {
  const rows = useMemo(() => flattenComponents(components), [components]);

  return (
    <div style={componentsGridStyle}>
      <section style={sectionStyle}>
        <div style={panelHeaderStyle}>
          <strong>Component Tree</strong>
          <span style={mutedStyle}>{components.length} tracked</span>
        </div>
        <ol style={listStyle}>
          {rows.map(({ component, depth }) => (
            <li key={component.id}>
              <button
                type="button"
                style={selected?.id === component.id ? activeComponentButtonStyle : componentButtonStyle}
                onClick={() => onSelect(component.id)}
              >
                <span style={{ paddingLeft: depth * 14 }}>{component.name}</span>
                <span style={mutedStyle}>{component.usages.length} uses</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section style={sectionStyle}>
        <div style={panelHeaderStyle}>
          <strong>{selected?.name ?? "Component Details"}</strong>
          {selected ? <span style={mutedStyle}>{selected.renderCount} renders</span> : null}
        </div>
        {selected ? (
          <div style={detailsStyle}>
            <div style={kvGridStyle}>
              <span>id</span><code>{selected.id}</code>
              <span>parent</span><code>{selected.parentId ?? "root"}</code>
              <span>last render</span><span>{new Date(selected.lastRenderAt).toLocaleTimeString()}</span>
            </div>
            <JsonBlock value={selected.usages} />
          </div>
        ) : (
          <p style={emptyStyle}>No tracked components yet. Wrap UI with &lt;MeshComponent name="..."&gt;.</p>
        )}
      </section>
    </div>
  );
}

function ProfilerPanel({
  rows,
  query,
  slowOnly,
  onQueryChange,
  onSlowOnlyChange,
  onClear
}: {
  rows: MeshProfilerSample[];
  query: string;
  slowOnly: boolean;
  onQueryChange: (query: string) => void;
  onSlowOnlyChange: (slowOnly: boolean) => void;
  onClear: () => void;
}) {
  const summary = summarizeProfiler(rows);

  return (
    <div style={tablePanelStyle}>
      <div style={toolbarStyle}>
        <input
          aria-label="Search StateMesh profiler"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search operations"
          style={inputStyle}
        />
        <label style={checkboxStyle}>
          <input type="checkbox" checked={slowOnly} onChange={(event) => onSlowOnlyChange(event.target.checked)} />
          Slow
        </label>
        <button type="button" style={buttonStyle} onClick={onClear}>Clear</button>
      </div>
      <div style={metricsGridStyle}>
        <div style={metricStyle}><span style={metricLabelStyle}>Samples</span><strong style={metricValueStyle}>{rows.length}</strong></div>
        <div style={metricStyle}><span style={metricLabelStyle}>Slow</span><strong style={metricValueStyle}>{summary.slow}</strong></div>
        <div style={metricStyle}><span style={metricLabelStyle}>Avg</span><strong style={metricValueStyle}>{summary.average}ms</strong></div>
        <div style={metricStyle}><span style={metricLabelStyle}>Max</span><strong style={metricValueStyle}>{summary.max}ms</strong></div>
      </div>
      <ProfilerRows rows={rows} />
    </div>
  );
}

function DoctorPanel({ report, onRefresh }: { report: MeshDoctorReport; onRefresh: () => void }) {
  return (
    <div style={tablePanelStyle}>
      <div style={panelHeaderStyle}>
        <strong>StateMesh Doctor</strong>
        <button type="button" style={buttonStyle} onClick={onRefresh}>Refresh</button>
      </div>
      <DoctorRows report={report} />
    </div>
  );
}

function EventsPanel({
  rows,
  query,
  category,
  failedOnly,
  onQueryChange,
  onCategoryChange,
  onFailedOnlyChange,
  onClear,
  onExport
}: {
  rows: MeshEvent[];
  query: string;
  category: DevtoolsEventCategory | "all";
  failedOnly: boolean;
  onQueryChange: (query: string) => void;
  onCategoryChange: (category: DevtoolsEventCategory | "all") => void;
  onFailedOnlyChange: (failedOnly: boolean) => void;
  onClear: () => void;
  onExport: () => void;
}) {
  return (
    <div style={tablePanelStyle}>
      <div style={toolbarStyle}>
        <input
          aria-label="Search StateMesh events"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search events"
          style={inputStyle}
        />
        <select
          aria-label="Filter StateMesh events"
          value={category}
          onChange={(event) => onCategoryChange(event.target.value as DevtoolsEventCategory | "all")}
          style={selectStyle}
        >
          <option value="all">All</option>
          {eventCategories.map((candidate) => (
            <option key={candidate} value={candidate}>{candidate}</option>
          ))}
        </select>
        <label style={checkboxStyle}>
          <input type="checkbox" checked={failedOnly} onChange={(event) => onFailedOnlyChange(event.target.checked)} />
          Failed
        </label>
        <button type="button" style={buttonStyle} onClick={onExport}>Export Events</button>
        <button type="button" style={buttonStyle} onClick={onClear}>Clear</button>
      </div>
      <EventRows rows={rows} />
    </div>
  );
}

function TimelinePanel({ rows, title }: { rows: MeshEvent[]; title: string }) {
  return (
    <div style={tablePanelStyle}>
      <div style={panelHeaderStyle}>
        <strong>{title}</strong>
        <span style={mutedStyle}>{rows.length} events</span>
      </div>
      <EventRows rows={rows} />
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div style={tablePanelStyle}>
      <div style={panelHeaderStyle}>
        <strong>{title}</strong>
        <button type="button" style={buttonStyle} onClick={() => copyJson(value)}>Copy</button>
      </div>
      <JsonBlock value={value} />
    </div>
  );
}

function EventRows({ rows }: { rows: MeshEvent[] }) {
  if (rows.length === 0) return <p style={emptyStyle}>No events captured yet.</p>;
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
  if (rows.length === 0) return <p style={emptyStyle}>No profiler samples yet.</p>;
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

function DoctorRows({ report, compact = false }: { report: MeshDoctorReport; compact?: boolean }) {
  const issues = compact ? report.issues.slice(0, 5) : report.issues;
  return (
    <div>
      <div style={doctorSummaryStyle}>
        <span>Errors: {report.summary.errors}</span>
        <span>Warnings: {report.summary.warnings}</span>
        <span>Info: {report.summary.info}</span>
      </div>
      {issues.length === 0 ? <p style={emptyStyle}>No Doctor issues detected.</p> : null}
      <ol style={listStyle}>
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.name ?? "mesh"}-${index}`} style={doctorRowStyle}>
            <strong>{issue.level.toUpperCase()} {issue.code}</strong>
            <span>{issue.message}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function JsonBlock({ value, compact = false }: { value: unknown; compact?: boolean }) {
  return (
    <pre style={compact ? compactJsonStyle : jsonStyle}>
      {formatJson(value)}
    </pre>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span style={statusStyle}>{status}</span>;
}

function createTabs(showProfiler: boolean, showDoctor: boolean): Array<{ value: DevtoolsView; label: string }> {
  return [
    { value: "overview", label: "Overview" },
    { value: "state", label: "State" },
    { value: "actions", label: "Actions" },
    { value: "resources", label: "Resources" },
    { value: "mutations", label: "Mutations" },
    { value: "forms", label: "Forms" },
    { value: "url", label: "URL" },
    { value: "components", label: "Components" },
    ...(showProfiler ? [{ value: "profiler" as const, label: "Profiler" }] : []),
    ...(showDoctor ? [{ value: "doctor" as const, label: "Doctor" }] : []),
    { value: "events", label: "Events" }
  ];
}

function flattenComponents(components: MeshDevtoolsComponentNode[]): Array<{ component: MeshDevtoolsComponentNode; depth: number }> {
  const children = new Map<string | null, MeshDevtoolsComponentNode[]>();
  for (const component of components) {
    const parentId = component.parentId ?? null;
    children.set(parentId, [...children.get(parentId) ?? [], component]);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const rows: Array<{ component: MeshDevtoolsComponentNode; depth: number }> = [];
  const visit = (component: MeshDevtoolsComponentNode, depth: number) => {
    rows.push({ component, depth });
    for (const child of children.get(component.id) ?? []) visit(child, depth + 1);
  };
  for (const root of children.get(null) ?? []) visit(root, 0);
  return rows;
}

function summarizeProfiler(rows: MeshProfilerSample[]): { slow: number; average: number; max: number } {
  if (rows.length === 0) return { slow: 0, average: 0, max: 0 };
  const total = rows.reduce((sum, row) => sum + row.duration, 0);
  return {
    slow: rows.filter((row) => row.slow).length,
    average: Math.round(total / rows.length),
    max: Math.max(...rows.map((row) => row.duration))
  };
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

function isFailedEvent(event: MeshEvent): boolean {
  return event.type.includes("failed") || event.type.includes("error");
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function exportDebugReport(report: StateMeshDebugReport, handler?: (report: StateMeshDebugReport) => void): void {
  if (handler) {
    handler(report);
    return;
  }
  copyJson(report);
}

function copyJson(value: unknown): void {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(JSON.stringify(value, null, 2));
}

const dockStyle = {
  position: "fixed",
  right: 0,
  bottom: 0,
  left: 0,
  width: "100vw",
  borderTop: "1px solid #d4d4d8",
  background: "#ffffff",
  color: "#18181b",
  boxShadow: "0 -18px 50px rgba(15, 23, 42, 0.18)",
  font: "12px system-ui, sans-serif",
  zIndex: 2147483647,
  display: "grid",
  gridTemplateRows: "42px 1fr"
} as const;

const launcherStyle = {
  position: "fixed",
  right: 16,
  bottom: 16,
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid #18181b",
  borderRadius: 8,
  background: "#18181b",
  color: "#ffffff",
  padding: "8px 10px",
  boxShadow: "0 14px 32px rgba(15, 23, 42, 0.24)",
  cursor: "pointer",
  font: "12px system-ui, sans-serif",
  zIndex: 2147483647
} as const;

const launcherMetaStyle = {
  color: "#d4d4d8"
} as const;

const headerStyle = {
  display: "grid",
  gridTemplateColumns: "180px 1fr auto",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderBottom: "1px solid #e4e4e7",
  minWidth: 0
} as const;

const brandStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0
} as const;

const brandTitleStyle = {
  fontSize: 13
} as const;

const brandMetaStyle = {
  color: "#71717a",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
} as const;

const tabsStyle = {
  display: "flex",
  gap: 2,
  overflowX: "auto",
  minWidth: 0
} as const;

const tabStyle = {
  border: 0,
  borderRadius: 5,
  background: "transparent",
  color: "#52525b",
  padding: "5px 8px",
  cursor: "pointer",
  font: "12px system-ui, sans-serif",
  whiteSpace: "nowrap"
} as const;

const activeTabStyle = {
  ...tabStyle,
  background: "#18181b",
  color: "#ffffff"
} as const;

const actionsStyle = {
  display: "flex",
  gap: 6,
  justifyContent: "flex-end"
} as const;

const bodyStyle = {
  minHeight: 0,
  overflow: "auto"
} as const;

const panelGridStyle = {
  display: "grid",
  gap: 10,
  padding: 10
} as const;

const metricsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
  gap: 8,
  padding: 10
} as const;

const metricStyle = {
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "8px 10px",
  display: "grid",
  gap: 4,
  background: "#fafafa"
} as const;

const metricLabelStyle = {
  color: "#71717a",
  fontSize: 11
} as const;

const metricValueStyle = {
  fontSize: 18
} as const;

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 10
} as const;

const componentsGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(240px, 34%) 1fr",
  gap: 10,
  padding: 10,
  minHeight: "100%"
} as const;

const sectionStyle = {
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  minHeight: 0,
  overflow: "hidden",
  background: "#ffffff"
} as const;

const sectionTitleStyle = {
  margin: 0,
  padding: "9px 10px",
  borderBottom: "1px solid #e4e4e7",
  fontSize: 12
} as const;

const tablePanelStyle = {
  padding: 10,
  minHeight: "100%",
  boxSizing: "border-box"
} as const;

const panelHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 10px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  background: "#fafafa",
  marginBottom: 8
} as const;

const toolbarStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(160px, 1fr) 136px auto auto auto",
  gap: 6,
  alignItems: "center",
  padding: "8px 10px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  background: "#fafafa",
  marginBottom: 8
} as const;

const buttonStyle = {
  border: "1px solid #d4d4d8",
  borderRadius: 6,
  background: "#ffffff",
  color: "#18181b",
  padding: "4px 8px",
  cursor: "pointer",
  font: "12px system-ui, sans-serif",
  whiteSpace: "nowrap"
} as const;

const inputStyle = {
  minWidth: 0,
  border: "1px solid #d4d4d8",
  borderRadius: 6,
  padding: "5px 7px",
  font: "12px system-ui, sans-serif"
} as const;

const selectStyle = {
  border: "1px solid #d4d4d8",
  borderRadius: 6,
  padding: "5px 7px",
  background: "#ffffff",
  font: "12px system-ui, sans-serif"
} as const;

const checkboxStyle = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  color: "#52525b",
  whiteSpace: "nowrap"
} as const;

const listStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  overflow: "auto"
} as const;

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 8,
  padding: "8px 10px",
  borderBottom: "1px solid #f4f4f5",
  alignItems: "center"
} as const;

const wideRowStyle = {
  display: "grid",
  gap: 7,
  padding: "10px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  marginBottom: 8,
  background: "#ffffff"
} as const;

const rowMainStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8
} as const;

const rowMetaStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
  color: "#71717a"
} as const;

const rowActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap"
} as const;

const timeStyle = {
  color: "#71717a"
} as const;

const slowTimeStyle = {
  color: "#b91c1c"
} as const;

const mutedStyle = {
  color: "#71717a"
} as const;

const warningTextStyle = {
  color: "#b45309"
} as const;

const statusStyle = {
  border: "1px solid #d4d4d8",
  borderRadius: 999,
  padding: "2px 7px",
  background: "#f4f4f5",
  color: "#3f3f46",
  fontSize: 11
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

const jsonStyle = {
  margin: 0,
  padding: 10,
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  background: "#fafafa",
  color: "#18181b",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflow: "auto",
  maxHeight: "calc(100% - 48px)"
} as const;

const compactJsonStyle = {
  ...jsonStyle,
  padding: 8,
  maxHeight: 160,
  fontSize: 11
} as const;

const componentButtonStyle = {
  width: "100%",
  border: 0,
  borderBottom: "1px solid #f4f4f5",
  background: "#ffffff",
  color: "#18181b",
  padding: "7px 10px",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  textAlign: "left",
  font: "12px system-ui, sans-serif"
} as const;

const activeComponentButtonStyle = {
  ...componentButtonStyle,
  background: "#f4f4f5"
} as const;

const detailsStyle = {
  display: "grid",
  gap: 10,
  padding: 10
} as const;

const kvGridStyle = {
  display: "grid",
  gridTemplateColumns: "90px minmax(0, 1fr)",
  gap: 6,
  color: "#52525b"
} as const;

const emptyStyle = {
  margin: 0,
  padding: "12px 10px",
  color: "#71717a"
} as const;
