import {
  ActionError,
  ComputedError,
  DuplicateRegistrationError,
  FormError,
  GuardError,
  MutationError,
  PersistenceError,
  ResourceError,
  SelectorError,
  StateMeshError,
  TransactionError,
  TransactionRollbackError,
  UrlStateError
} from "../errors";
import { resolveStorageAdapter } from "../persist/storage";
import { createBatcher, cloneState, debounce, getPath, isBrowser, pickPaths, shallowEqual, setPath as setValueAtPath } from "../utils";
import type { EqualityFn } from "../utils";
import type {
  ComputedDefinition,
  EntityCollection,
  EntityIdSelector,
  FormApi,
  FormAutosaveOptions,
  FormDefinition,
  FormDirtyFields,
  FormErrors,
  FormFieldArrayApi,
  FormState,
  FormValidatingFields,
  Mesh,
  MeshAction,
  MeshActionContext,
  MeshDehydratedSnapshot,
  MeshDehydrateOptions,
  MeshDevtoolsComponentNode,
  MeshDevtoolsComponentRegistration,
  MeshDevtoolsComponentUsage,
  MeshDevtoolsFormRow,
  MeshDevtoolsMutationRow,
  MeshDevtoolsResourceRow,
  MeshDevtoolsSnapshot,
  MeshDevtoolsSnapshotOptions,
  MeshDoctorOptions,
  MeshDoctorReport,
  MeshGuard,
  MeshGuardContext,
  MeshGuardTarget,
  MeshHydrateOptions,
  MeshEvent,
  MeshMiddleware,
  MeshOptions,
  MeshPath,
  MeshProfilerFilter,
  MeshProfilerSample,
  MaybePromise,
  MeshPlugin,
  MeshRegistryOptions,
  MeshSetStateInput,
  MeshSetStateOptions,
  MeshSubscriptionOptions,
  MutationContext,
  MutationDefinition,
  MutationHandle,
  MutationQueuePersistOptions,
  MutationStatus,
  QueuedMutation,
  PersistOptions,
  ResourceDehydrateOptions,
  ResourceDefinition,
  ResourceFetchContext,
  ResourceFetchOptions,
  ResourceHandle,
  ResourceHydrateOptions,
  ResourceInvalidation,
  ResourcePersistOptions,
  ResourceSetDataOptions,
  ResourceSnapshot,
  ResourceSnapshotEntry,
  ResourceStatus,
  ResourceSubscribeOptions,
  ResourceTag,
  Snapshot,
  TransactionContext,
  TransactionDefinition,
  TransactionHandle,
  TransactionRegistrationOptions,
  TransactionStatus,
  Unsubscribe,
  UrlSerializer,
  UrlStateOptions
} from "./types";

type Subscription<TState, TSelected> = {
  selector: (state: TState) => TSelected;
  listener: (selected: TSelected, previous: TSelected, event?: MeshEvent) => void;
  equality: EqualityFn<TSelected>;
  lastValue: TSelected;
};

type ComputedEntry<TState, TValue> = {
  definition: ComputedDefinition<TState, TValue>;
  dirty: boolean;
  hasValue: boolean;
  value: TValue | undefined;
  depValues: Map<string, unknown>;
  listeners: Set<() => void>;
};

type TransactionRuntime = {
  controller: AbortController | null;
  cancelled: boolean;
  runId: symbol | null;
  lastPayload: unknown;
  snapshot: unknown;
  inFlight: Promise<unknown> | null;
  queue: Promise<unknown>;
};

type ResourceEntry = {
  name: string;
  key: string;
  params: unknown;
  status: "idle" | "loading" | "success" | "error";
  pending: boolean;
  fetching: boolean;
  stale: boolean;
  data: unknown;
  error: Error | null;
  tags: string[];
  pages: unknown[];
  pageParams: unknown[];
  startedAt: number | null;
  finishedAt: number | null;
  duration: number | null;
  updatedAt: number | null;
  controller: AbortController | null;
  inFlight: Promise<unknown> | null;
  gcTimer: ReturnType<typeof setTimeout> | null;
};

type MutationRuntime = {
  controller: AbortController | null;
  inFlight: Promise<unknown> | null;
  queue: Promise<unknown>;
  lastPayload: unknown;
};

type QueuedMutationEntry = QueuedMutation & {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type UrlStateEntry<TValues extends Record<string, unknown>> = {
  defaults: TValues;
  values: TValues;
  options: UrlStateOptions<TValues>;
  listeners: Set<() => void>;
  cleanup: Unsubscribe;
  write: (values: TValues) => void;
};

type FormEntry<TValues extends Record<string, unknown>> = {
  definition: FormDefinition<TValues>;
  initialValues: TValues;
  state: FormState<TValues>;
  listeners: Set<() => void>;
  validationRun: symbol | null;
  fieldValidationRuns: Map<string, symbol>;
  autosave: { (): void; cancel: () => void } | null;
};

type PluginEntry = {
  cleanup: Unsubscribe | void;
};

type GuardEntry<TState> = {
  target: MeshGuardTarget | null;
  handler: MeshGuard<TState>;
};

type DevtoolsComponentEntry = MeshDevtoolsComponentRegistration & {
  renderCount: number;
  lastRenderAt: number;
  cleanupToken: symbol;
  usages: Map<string, MeshDevtoolsComponentUsage>;
};

const DEFAULT_TRANSACTION_STATUS: TransactionStatus = {
  status: "idle",
  pending: false,
  success: false,
  error: null,
  data: null,
  startedAt: null,
  finishedAt: null,
  duration: null,
  attempts: 0
};

const DEFAULT_MUTATION_STATUS: MutationStatus = {
  status: "idle",
  pending: false,
  queued: false,
  success: false,
  data: null,
  error: null,
  lastPayload: undefined,
  startedAt: null,
  finishedAt: null,
  duration: null,
  runs: 0,
  queueSize: 0
};

let idCounter = 0;

/**
 * Create a StateMesh external store.
 *
 * Create the mesh once, register actions/transactions/computed values once, and pass it to
 * `StateMeshProvider`. The initial state is cloned so StateMesh never mutates the object you pass in.
 *
 * @example
 * ```ts
 * const mesh = createMesh({
 *   name: "shopdesk",
 *   state: {
 *     theme: "light",
 *     cart: { items: [], status: "idle", error: null }
 *   }
 * });
 *
 * mesh.action("cart.clear", (state) => {
 *   state.cart.items = [];
 * });
 * ```
 */

// Module-level constant — never changes, so extract it from the closure to avoid
// temporal-dead-zone issues with hoisted function declarations referencing it.
const PROFILED_EVENT_TYPES = new Set([
  "action.started", "action.completed", "action.failed",
  "transaction.started", "transaction.committed", "transaction.failed", "transaction.cancelled",
  "resource.fetch.started", "resource.fetch.succeeded", "resource.fetch.failed",
  "mutation.started", "mutation.succeeded", "mutation.failed",
  "form.submit.started", "form.submit.succeeded", "form.submit.failed",
  "form.autosave.started", "form.autosave.succeeded", "form.autosave.failed"
]);

export function createMesh<TState>(options: MeshOptions<TState>): Mesh<TState> {
  const name = options.name ?? "statemesh";
  const initialState = cloneState(options.state);
  let state = cloneState(options.state);
  let destroyed = false;

  // Hoisted to the top so hoisted function declarations (e.g. profileEvent, notifyDevtools,
  // getResourceStatus) can reference them without temporal-dead-zone errors.
  let devtoolsNotifyTimer: ReturnType<typeof setTimeout> | null = null;
  const lastResourceStatuses = new Map<string, ResourceStatus>();

  const subscriptions = new Set<Subscription<TState, unknown>>();
  const eventListeners = new Set<(event: MeshEvent) => void | Promise<void>>();
  const middlewares = new Set<MeshMiddleware<TState>>();
  const guards = new Set<GuardEntry<TState>>();
  const snapshots = new Map<string, Snapshot<TState>>();
  const actions = new Map<string, (state: TState, payload: unknown, context: unknown) => unknown>();
  const computedEntries = new Map<string, ComputedEntry<TState, unknown>>();
  const transactionDefinitions = new Map<string, TransactionDefinition<TState, unknown, unknown>>();
  const transactionOptions = new Map<string, TransactionRegistrationOptions>();
  const transactionStatuses = new Map<string, TransactionStatus>();
  const transactionListeners = new Map<string, Set<() => void>>();
  const transactionRuntime = new Map<string, TransactionRuntime>();
  const resourceDefinitions = new Map<string, ResourceDefinition<TState, unknown, unknown, unknown>>();
  const resourceEntries = new Map<string, ResourceEntry>();
  const resourceListeners = new Map<string, Set<() => void>>();
  const resourceChangeListeners = new Set<() => void>();
  const mutationDefinitions = new Map<string, MutationDefinition<TState, unknown, unknown>>();
  const mutationStatuses = new Map<string, MutationStatus>();
  const mutationListeners = new Map<string, Set<() => void>>();
  const mutationRuntime = new Map<string, MutationRuntime>();
  const queuedMutations: QueuedMutationEntry[] = [];
  const mutationQueueListeners = new Set<() => void>();
  const urlStates = new Map<string, UrlStateEntry<Record<string, unknown>>>();
  const formEntries = new Map<string, FormEntry<Record<string, unknown>>>();
  const pluginCleanups = new Map<string, PluginEntry>();
  const pendingEvents: MeshEvent[] = [];
  const profilerSamples: MeshProfilerSample[] = [];
  const profilerListeners = new Set<() => void>();
  const profilerStarts = new Map<string, number[]>();
  const profilerLimit = Math.max(1, options.profiler?.limit ?? 200);
  const profilerSlowThreshold = Math.max(0, options.profiler?.slowThreshold ?? 16);
  const devtoolsListeners = new Set<() => void>();
  const devtoolsComponents = new Map<string, DevtoolsComponentEntry>();
  const devtoolsPendingComponentUsages = new Map<string, Map<string, MeshDevtoolsComponentUsage>>();
  let profilerSampleCounter = 0;

  const batcher = createBatcher(() => {
    const events = pendingEvents.splice(0);
    const event = events.length > 0 ? events[events.length - 1] : undefined;
    for (const queued of events) {
      dispatchEvent(queued);
    }
    notifyComputed(event);
    notifySubscriptions(event);
  });

  const mesh = {
    get name() {
      return name;
    },
    getState: () => state,
    getInitialState: () => cloneState(initialState),
    getSelectedSnapshot: <TSelected>(selectorOrPath: ((state: TState) => TSelected) | MeshPath) =>
      selectValue(selectorOrPath),
    getSelectedServerSnapshot: <TSelected>(selectorOrPath: ((state: TState) => TSelected) | MeshPath) =>
      selectValue(selectorOrPath),
    setState,
    setPath,
    reset,
    destroy,
    subscribe,
    action,
    runAction,
    transaction,
    runTransaction,
    getTransactionStatus,
    subscribeTransaction,
    cancelTransaction,
    resetTransaction,
    retryTransaction,
    resource,
    fetchResource,
    prefetchResource,
    fetchNextResourcePage,
    getResourceStatus,
    setResourceData,
    invalidateResources,
    subscribeResource,
    dehydrateResources,
    hydrateResources,
    persistResources,
    dehydrate,
    hydrate,
    mutation,
    runMutation,
    getMutationStatus,
    subscribeMutation,
    resetMutation,
    getQueuedMutations,
    runQueuedMutations,
    clearQueuedMutations,
    persistQueuedMutations,
    doctor,
    getProfilerSamples,
    clearProfilerSamples,
    subscribeProfiler,
    getDevtoolsSnapshot,
    subscribeDevtools,
    registerDevtoolsComponent,
    recordDevtoolsComponentUsage,
    normalizeEntities,
    mergeEntities,
    removeEntities,
    denormalizeEntities,
    computed,
    getComputed,
    subscribeComputed,
    persist,
    urlState,
    getUrlState,
    setUrlState,
    subscribeUrlState,
    form,
    getForm,
    subscribeForm,
    snapshot,
    restore,
    batch,
    middleware,
    guard,
    use,
    onEvent,
    emit
  } satisfies Mesh<TState>;

  if (isBrowser()) {
    window.addEventListener("online", handleOnline);
  }

  return mesh;

  function assertActive() {
    if (destroyed) {
      throw new StateMeshError("Cannot use a destroyed StateMesh instance.", {
        code: "STATEMESH_DESTROYED",
        metadata: { mesh: name }
      });
    }
  }

  function emit(event: MeshEvent): void {
    dispatchEvent(event);
  }

  function queueEvent(event: MeshEvent): void {
    pendingEvents.push(event);
  }

  function dispatchEvent(event: MeshEvent): void {
    profileEvent(event);
    notifyDevtools();

    for (const middleware of middlewares) {
      try {
        catchAsyncError(middleware(event, mesh));
      } catch {
        // Middleware must not make state updates fail.
      }
    }

    for (const listener of eventListeners) {
      try {
        catchAsyncError(listener(event));
      } catch {
        // Event listeners are observational.
      }
    }
  }

  // Set of event types the profiler tracks. Using a Set gives O(1) lookup for the
  // Fast-path: skip events the profiler doesn't track (e.g. state.changed, url.changed, form.changed)
  function profileEvent(event: MeshEvent): void {
    if (!PROFILED_EVENT_TYPES.has(event.type)) return;

    switch (event.type) {
      case "action.started":
      case "transaction.started":
      case "mutation.started":
      case "form.submit.started":
      case "form.autosave.started":
        startProfilerSample(
          event.type === "action.started" ? "action" as const
            : event.type === "transaction.started" ? "transaction" as const
            : event.type === "mutation.started" ? "mutation" as const
            : "form" as const,
          event.name,
          event.type === "mutation.started" ? `mutation:${event.name}`
            : event.type.startsWith("form.") ? `form:${event.type.split(".")[1]}:${event.name}`
            : `${event.type.split(".")[0]}:${event.name}`,
          event.timestamp
        );
        return;

      case "action.completed":
      case "action.failed":
        event.type === "action.completed"
          ? finishProfilerSample("action", event.name, `action:${event.name}`, "success", event.timestamp, event.duration, event.metadata)
          : finishProfilerSample("action", event.name, `action:${event.name}`, "error", event.timestamp, undefined, {
              ...event.metadata,
              error: getProfilerErrorCode((event as MeshEvent & { error: unknown }).error)
            });
        return;

      case "transaction.committed":
      case "transaction.failed":
      case "transaction.cancelled":
        finishProfilerSample(
          "transaction", event.name, `transaction:${event.name}`,
          event.type === "transaction.committed" ? "success" as const
            : event.type === "transaction.cancelled" ? "cancelled" as const
            : "error" as const,
          event.timestamp,
          event.type === "transaction.committed" ? event.duration : undefined,
          event.type !== "transaction.committed"
            ? { ...event.metadata, error: getProfilerErrorCode((event as MeshEvent & { error: unknown }).error) }
            : event.metadata
        );
        return;

      case "resource.fetch.started":
        startProfilerSample("resource", event.name, `resource:${event.key}`, event.timestamp);
        return;

      case "resource.fetch.succeeded":
      case "resource.fetch.failed":
        event.type === "resource.fetch.succeeded"
          ? finishProfilerSample("resource", event.name, `resource:${event.key}`, "success", event.timestamp, event.duration, {
              ...event.metadata, key: event.key
            })
          : finishProfilerSample("resource", event.name, `resource:${event.key}`, "error", event.timestamp, undefined, {
              ...event.metadata, key: event.key, error: getProfilerErrorCode((event as MeshEvent & { error: unknown }).error)
            });
        return;

      case "mutation.succeeded":
      case "mutation.failed":
        event.type === "mutation.succeeded"
          ? finishProfilerSample("mutation", event.name, `mutation:${event.name}`, "success", event.timestamp, event.duration, event.metadata)
          : finishProfilerSample("mutation", event.name, `mutation:${event.name}`, "error", event.timestamp, undefined, {
              ...event.metadata, error: getProfilerErrorCode((event as MeshEvent & { error: unknown }).error)
            });
        return;

      case "form.submit.succeeded":
      case "form.submit.failed":
      case "form.autosave.succeeded":
      case "form.autosave.failed": {
        const mode = event.type.startsWith("form.autosave") ? "autosave" as const : "submit" as const;
        event.type.endsWith(".succeeded")
          ? finishProfilerSample("form", event.name, `form:${mode}:${event.name}`, "success", event.timestamp, event.duration, {
              ...event.metadata, mode
            })
          : finishProfilerSample("form", event.name, `form:${mode}:${event.name}`, "error", event.timestamp, undefined, {
              ...event.metadata, mode, error: getProfilerErrorCode((event as MeshEvent & { error: unknown }).error)
            });
        return;
      }
    }
  }

  function startProfilerSample(
    _kind: MeshProfilerSample["kind"],
    _operationName: string,
    key: string,
    startedAt: number
  ): void {
    const starts = profilerStarts.get(key) ?? [];
    starts.push(startedAt);
    profilerStarts.set(key, starts);
  }

  function finishProfilerSample(
    kind: MeshProfilerSample["kind"],
    operationName: string,
    key: string,
    status: MeshProfilerSample["status"],
    finishedAt: number,
    duration?: number,
    metadata?: Record<string, unknown>
  ): void {
    const starts = profilerStarts.get(key);
    const startedAt = starts?.shift() ?? Math.max(0, finishedAt - (duration ?? 0));
    if (starts?.length === 0) profilerStarts.delete(key);
    recordProfilerSample({
      id: `profile_${++profilerSampleCounter}`,
      kind,
      name: operationName,
      status,
      duration: duration ?? Math.max(0, finishedAt - startedAt),
      startedAt,
      finishedAt,
      slow: (duration ?? Math.max(0, finishedAt - startedAt)) >= profilerSlowThreshold,
      metadata
    });
  }

  function recordProfilerSample(sample: MeshProfilerSample): void {
    profilerSamples.push(sample);
    if (profilerSamples.length > profilerLimit) {
      profilerSamples.splice(0, profilerSamples.length - profilerLimit);
    }
    for (const listener of profilerListeners) listener();
    notifyDevtools();
  }

  function getProfilerSamples(filter: MeshProfilerFilter = {}): MeshProfilerSample[] {
    const query = filter.query?.trim().toLowerCase();
    const samples = profilerSamples.filter((sample) => {
      if (filter.kinds?.length && !filter.kinds.includes(sample.kind)) return false;
      if (filter.minDuration !== undefined && sample.duration < filter.minDuration) return false;
      if (filter.slowOnly && !sample.slow) return false;
      if (query && !`${sample.kind} ${sample.name} ${sample.status}`.toLowerCase().includes(query)) return false;
      return true;
    });
    const limited = filter.limit === undefined ? samples : samples.slice(Math.max(0, samples.length - Math.max(0, filter.limit)));
    return limited.map((sample) => ({
      ...sample,
      metadata: sample.metadata ? { ...sample.metadata } : undefined
    }));
  }

  function clearProfilerSamples(): void {
    if (profilerSamples.length === 0) return;
    profilerSamples.length = 0;
    profilerStarts.clear();
    for (const listener of profilerListeners) listener();
    notifyDevtools();
  }

  function subscribeProfiler(listener: () => void): Unsubscribe {
    profilerListeners.add(listener);
    return () => profilerListeners.delete(listener);
  }

  function getDevtoolsSnapshot(snapshotOptions: MeshDevtoolsSnapshotOptions = {}): MeshDevtoolsSnapshot {
    const previewBytes = snapshotOptions.previewBytes ?? 2_000;
    const resources = [...resourceEntries.values()]
      .map((entry): MeshDevtoolsResourceRow | null => {
        const definition = resourceDefinitions.get(entry.name);
        if (!definition) return null;
        const status = createResourceStatus(entry, definition);
        const data = maskDevtoolsValue(status.data, snapshotOptions.mask, previewBytes);
        return {
          ...status,
          params: createDevtoolsPreview(status.params, previewBytes),
          data,
          error: status.error ? sanitizeDevtoolsValue(status.error) : null,
          pages: status.pages.map((page) => maskDevtoolsValue(page, snapshotOptions.mask, previewBytes)),
          subscribers: resourceListeners.get(entry.key)?.size ?? 0,
          preview: data
        };
      })
      .filter((row): row is MeshDevtoolsResourceRow => Boolean(row))
      .sort((a, b) => `${a.name}:${a.key}`.localeCompare(`${b.name}:${b.key}`));
    const mutations = [...mutationDefinitions.keys()]
      .map((mutationName): MeshDevtoolsMutationRow => {
        const status = getMutationStatus(mutationName);
        return {
          ...status,
          name: mutationName,
          data: maskDevtoolsValue(status.data, snapshotOptions.mask, previewBytes),
          error: status.error ? sanitizeDevtoolsValue(status.error) : null,
          lastPayload: maskDevtoolsValue(status.lastPayload, snapshotOptions.mask, previewBytes)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const forms = [...formEntries.entries()]
      .map(([formName, entry]): MeshDevtoolsFormRow => ({
        name: formName,
        values: maskDevtoolsValue(entry.state.values, snapshotOptions.mask, previewBytes),
        errors: { ...entry.state.errors } as Record<string, string>,
        serverErrors: { ...entry.state.serverErrors } as Record<string, string>,
        dirtyFields: { ...entry.state.dirtyFields } as Record<string, boolean>,
        touched: { ...entry.state.touched } as Record<string, boolean>,
        submitting: entry.state.submitting,
        autosaving: entry.state.autosaving,
        currentStep: entry.state.currentStep,
        stepIndex: entry.state.stepIndex
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const urlStateValues = [...urlStates.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((values, [urlName, entry]) => {
        values[urlName] = maskDevtoolsValue(entry.values, snapshotOptions.mask, previewBytes);
        return values;
      }, {});
    const components = [...devtoolsComponents.values()]
      .map((entry): MeshDevtoolsComponentNode => ({
        id: entry.id,
        name: entry.name,
        parentId: entry.parentId,
        renderCount: entry.renderCount,
        lastRenderAt: entry.lastRenderAt,
        usages: [...entry.usages.values()].sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`))
      }))
      .sort((a, b) => (a.parentId ?? "").localeCompare(b.parentId ?? "") || a.name.localeCompare(b.name));
    const profiler = getProfilerSamples();
    const report = doctor();
    const queued = getQueuedMutations().map((mutation) => ({
      ...mutation,
      payload: maskDevtoolsValue(mutation.payload, snapshotOptions.mask, previewBytes)
    }));

    return {
      mesh: name,
      generatedAt: Date.now(),
      state: snapshotOptions.state === false ? undefined : maskDevtoolsValue(state, snapshotOptions.mask, previewBytes),
      resources,
      mutations,
      forms,
      urlStates: urlStateValues,
      queuedMutations: queued,
      components,
      profiler,
      doctor: report,
      summary: {
        stateKeys: countDevtoolsStateKeys(state),
        resources: resources.length,
        resourceErrors: resources.filter((resource) => resource.status === "error").length,
        staleResources: resources.filter((resource) => resource.stale).length,
        activeMutations: mutations.filter((mutation) => mutation.pending).length,
        queuedMutations: queued.length,
        forms: forms.length,
        formErrors: forms.filter((form) => Object.keys(form.errors).length > 0 || Object.keys(form.serverErrors).length > 0).length,
        components: components.length,
        slowOperations: profiler.filter((sample) => sample.slow).length,
        doctorErrors: report.summary.errors,
        doctorWarnings: report.summary.warnings
      }
    };
  }

  function subscribeDevtools(listener: () => void): Unsubscribe {
    devtoolsListeners.add(listener);
    return () => devtoolsListeners.delete(listener);
  }

  function registerDevtoolsComponent(component: MeshDevtoolsComponentRegistration): Unsubscribe {
    const cleanupToken = Symbol(component.id);
    const existing = devtoolsComponents.get(component.id);
    if (existing) {
      existing.name = component.name;
      existing.parentId = component.parentId;
      existing.renderCount += 1;
      existing.lastRenderAt = Date.now();
      existing.cleanupToken = cleanupToken;
      applyPendingDevtoolsComponentUsages(existing);
    } else {
      const entry: DevtoolsComponentEntry = {
        ...component,
        parentId: component.parentId,
        renderCount: 1,
        lastRenderAt: Date.now(),
        cleanupToken,
        usages: new Map()
      };
      applyPendingDevtoolsComponentUsages(entry);
      devtoolsComponents.set(component.id, entry);
    }
    notifyDevtools();
    return () => {
      setTimeout(() => {
        const current = devtoolsComponents.get(component.id);
        if (current?.cleanupToken !== cleanupToken) return;
        devtoolsComponents.delete(component.id);
        notifyDevtools();
      }, 0);
    };
  }

  function recordDevtoolsComponentUsage(componentId: string, usage: MeshDevtoolsComponentUsage): void {
    const entry = devtoolsComponents.get(componentId);
    if (!entry) {
      let pending = devtoolsPendingComponentUsages.get(componentId);
      if (!pending) {
        pending = new Map();
        devtoolsPendingComponentUsages.set(componentId, pending);
      }
      pending.set(`${usage.kind}:${usage.name}`, {
        ...usage,
        details: usage.details ? { ...usage.details } : undefined
      });
      return;
    }
    entry.usages.set(`${usage.kind}:${usage.name}`, {
      ...usage,
      details: usage.details ? { ...usage.details } : undefined
    });
    entry.lastRenderAt = Date.now();
    notifyDevtools();
  }

  function applyPendingDevtoolsComponentUsages(entry: DevtoolsComponentEntry): void {
    const pending = devtoolsPendingComponentUsages.get(entry.id);
    if (!pending) return;
    for (const [key, usage] of pending) {
      entry.usages.set(key, usage);
    }
    devtoolsPendingComponentUsages.delete(entry.id);
  }

  function notifyDevtools(): void {
    // Throttle devtools notifications to at most once per frame (roughly 60fps).
    // getDevtoolsSnapshot is expensive (deep-clones state, iterates resources/forms/mutations),
    // and there's no benefit to re-rendering the devtools panel faster than the display rate.
    if (devtoolsNotifyTimer) return;
    devtoolsNotifyTimer = setTimeout(() => {
      devtoolsNotifyTimer = null;
      for (const listener of devtoolsListeners) {
        listener();
      }
    }, 16);
  }

  function doctor(doctorOptions: MeshDoctorOptions = {}): MeshDoctorReport {
    const issues: MeshDoctorReport["issues"] = [];
    const now = Date.now();
    const stateSizeWarningBytes = doctorOptions.stateSizeWarningBytes ?? 250_000;
    const queuedMutationAgeWarning = parseDuration(doctorOptions.queuedMutationAgeWarning ?? "5m");
    const staleResourceWarning = parseDuration(doctorOptions.staleResourceWarning ?? "5m");
    const slowOperationWarningMs = doctorOptions.slowOperationWarningMs ?? profilerSlowThreshold;
    const stateSize = estimateSerializedSize(state);

    if (stateSize >= stateSizeWarningBytes) {
      issues.push({
        level: "warning",
        code: "STATE_SIZE_LARGE",
        message: `Serialized mesh state is approximately ${stateSize} bytes.`,
        category: "state",
        metadata: { bytes: stateSize, threshold: stateSizeWarningBytes }
      });
    }

    for (const [resourceName, definition] of resourceDefinitions) {
      if (!definition.tags) {
        issues.push({
          level: "warning",
          code: "RESOURCE_WITHOUT_TAGS",
          message: `Resource "${resourceName}" has no invalidation tags.`,
          category: "resource",
          name: resourceName
        });
      }
    }

    for (const entry of resourceEntries.values()) {
      const definition = resourceDefinitions.get(entry.name);
      if (!definition) continue;
      if (entry.error) {
        issues.push({
          level: "error",
          code: "RESOURCE_ERROR",
          message: `Resource "${entry.name}" is in an error state.`,
          category: "resource",
          name: entry.name,
          metadata: { key: entry.key, error: getProfilerErrorCode(entry.error) }
        });
      }
      const staleFor = entry.updatedAt ? now - entry.updatedAt : 0;
      if (entry.status === "success" && isResourceEntryStale(entry, definition) && staleFor >= staleResourceWarning) {
        issues.push({
          level: "warning",
          code: "RESOURCE_STALE_LONG",
          message: `Resource "${entry.name}" has remained stale for ${staleFor}ms.`,
          category: "resource",
          name: entry.name,
          metadata: { key: entry.key, staleFor, threshold: staleResourceWarning }
        });
      }
    }

    for (const queued of queuedMutations) {
      const queuedFor = now - queued.queuedAt;
      if (queuedFor >= queuedMutationAgeWarning) {
        issues.push({
          level: "error",
          code: "MUTATION_QUEUE_STUCK",
          message: `Mutation "${queued.name}" has been queued for ${queuedFor}ms.`,
          category: "mutation",
          name: queued.name,
          metadata: { id: queued.id, queuedFor, threshold: queuedMutationAgeWarning }
        });
      }
    }

    for (const [formName, entry] of formEntries) {
      const serverErrorCount = Object.keys(entry.state.serverErrors).length;
      if (entry.state.submitError || entry.state.autosaveError || serverErrorCount > 0) {
        issues.push({
          level: entry.state.submitError || entry.state.autosaveError ? "error" : "warning",
          code: "FORM_UNRESOLVED_ERRORS",
          message: `Form "${formName}" has unresolved submit, autosave, or server errors.`,
          category: "form",
          name: formName,
          metadata: {
            serverErrorCount,
            submitError: getProfilerErrorCode(entry.state.submitError),
            autosaveError: getProfilerErrorCode(entry.state.autosaveError)
          }
        });
      }
    }

    const slowestByOperation = new Map<string, MeshProfilerSample>();
    for (const sample of profilerSamples) {
      if (sample.duration < slowOperationWarningMs) continue;
      const key = `${sample.kind}:${sample.name}`;
      const current = slowestByOperation.get(key);
      if (!current || sample.duration > current.duration) slowestByOperation.set(key, sample);
    }
    for (const sample of slowestByOperation.values()) {
      issues.push({
        level: "warning",
        code: "OPERATION_SLOW",
        message: `${sample.kind} "${sample.name}" took ${sample.duration}ms.`,
        category: "profiler",
        name: sample.name,
        metadata: { kind: sample.kind, duration: sample.duration, threshold: slowOperationWarningMs }
      });
    }

    if (doctorOptions.includeInfo && issues.length === 0) {
      issues.push({
        level: "info",
        code: "MESH_HEALTHY",
        message: `No production-readiness issues were detected for mesh "${name}".`,
        category: "mesh"
      });
    }

    return {
      mesh: name,
      generatedAt: now,
      issues,
      summary: {
        errors: issues.filter((issue) => issue.level === "error").length,
        warnings: issues.filter((issue) => issue.level === "warning").length,
        info: issues.filter((issue) => issue.level === "info").length
      }
    };
  }

  function commitState(nextState: TState, event: MeshEvent, silent = false): void {
    state = nextState;
    if (!silent) queueEvent(event);
    batcher.schedule();
  }

  function setState(input: MeshSetStateInput<TState>, setOptions: MeshSetStateOptions = {}): void {
    assertActive();
    const event = createStateEvent(setOptions.path, setOptions.metadata);

    if (setOptions.path) {
      const current = getPath(state, setOptions.path);
      const nextValue =
        typeof input === "function"
          ? (input as (value: unknown) => unknown)(current)
          : input;
      commitState(setValueAtPath(state, setOptions.path, nextValue), event, setOptions.silent);
      return;
    }

    if (typeof input === "function") {
      const draft = cloneState(state);
      const returned = (input as (draft: TState) => TState | Partial<TState> | void)(draft);
      const nextState = returned === undefined ? draft : normalizeSetStateResult(returned, setOptions.replace);
      commitState(nextState, event, setOptions.silent);
      return;
    }

    commitState(normalizeSetStateResult(input, setOptions.replace), event, setOptions.silent);
  }

  function normalizeSetStateResult(input: Partial<TState> | TState, replace = false): TState {
    if (replace || typeof input !== "object" || input === null || Array.isArray(input)) {
      return input as TState;
    }

    return { ...(state as Record<string, unknown>), ...(input as Record<string, unknown>) } as TState;
  }

  function setPath(path: MeshPath, valueOrUpdater: unknown | ((currentValue: unknown) => unknown), metadata?: Record<string, unknown>): void {
    assertActive();
    const current = getPath(state, path);
    const nextValue = typeof valueOrUpdater === "function"
      ? (valueOrUpdater as (currentValue: unknown) => unknown)(current)
      : valueOrUpdater;

    if (Object.is(current, nextValue)) return;

    commitState(setValueAtPath(state, path, nextValue), createStateEvent(path, metadata));
  }

  function reset(): void {
    assertActive();
    state = cloneState(initialState);
    queueEvent({ type: "state.reset", timestamp: Date.now() });
    batcher.schedule();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    subscriptions.clear();
    eventListeners.clear();
    middlewares.clear();
    guards.clear();
    snapshots.clear();
    actions.clear();
    computedEntries.clear();
    transactionDefinitions.clear();
    transactionStatuses.clear();
    transactionListeners.clear();
    for (const runtime of transactionRuntime.values()) {
      runtime.cancelled = true;
      runtime.controller?.abort();
    }
    transactionRuntime.clear();
    resourceDefinitions.clear();
    for (const entry of resourceEntries.values()) {
      entry.controller?.abort();
      if (entry.gcTimer) clearTimeout(entry.gcTimer);
    }
    resourceEntries.clear();
    resourceListeners.clear();
    resourceChangeListeners.clear();
    mutationDefinitions.clear();
    mutationStatuses.clear();
    mutationListeners.clear();
    mutationQueueListeners.clear();
    profilerSamples.length = 0;
    profilerListeners.clear();
    profilerStarts.clear();
    devtoolsListeners.clear();
    devtoolsComponents.clear();
    devtoolsPendingComponentUsages.clear();
    for (const runtime of mutationRuntime.values()) {
      runtime.controller?.abort();
    }
    mutationRuntime.clear();
    clearQueuedMutations(new MutationError("StateMesh was destroyed before queued mutations could run.", {
      code: "STATEMESH_MUTATION_QUEUE_CLEARED",
      metadata: { mesh: name }
    }));
    if (isBrowser()) {
      window.removeEventListener("online", handleOnline);
    }
    for (const entry of urlStates.values()) {
      entry.cleanup();
      entry.listeners.clear();
    }
    urlStates.clear();
    for (const entry of formEntries.values()) {
      entry.autosave?.cancel();
      entry.listeners.clear();
    }
    formEntries.clear();
    for (const entry of pluginCleanups.values()) {
      entry.cleanup?.();
    }
    pluginCleanups.clear();
  }

  function subscribe<TSelected>(
    selectorOrPath: ((state: TState) => TSelected) | MeshPath,
    listener: (selected: TSelected, previous: TSelected, event?: MeshEvent) => void,
    subscriptionOptions: MeshSubscriptionOptions<TSelected> = {}
  ): Unsubscribe {
    assertActive();
    const equality = subscriptionOptions.equality ?? Object.is;
    const subscription: Subscription<TState, TSelected> = {
      selector: createSelector(selectorOrPath),
      listener,
      equality,
      lastValue: selectValue(selectorOrPath)
    };

    subscriptions.add(subscription as Subscription<TState, unknown>);

    if (subscriptionOptions.fireImmediately) {
      listener(subscription.lastValue, subscription.lastValue);
    }

    return () => {
      subscriptions.delete(subscription as Subscription<TState, unknown>);
    };
  }

  function notifySubscriptions(event?: MeshEvent): void {
    for (const subscription of Array.from(subscriptions)) {
      let selected: unknown;
      try {
        selected = subscription.selector(state);
      } catch (error) {
        throw new SelectorError("StateMesh selector failed while notifying subscribers.", {
          cause: error,
          metadata: { mesh: name }
        });
      }

      if (!subscription.equality(selected, subscription.lastValue)) {
        const previous = subscription.lastValue;
        subscription.lastValue = selected;
        subscription.listener(selected, previous, event);
      }
    }
  }

  function createSelector<TSelected>(selectorOrPath: ((state: TState) => TSelected) | MeshPath): (state: TState) => TSelected {
    if (typeof selectorOrPath === "function") return selectorOrPath;
    return (currentState) => getPath<TSelected>(currentState, selectorOrPath);
  }

  function selectValue<TSelected>(selectorOrPath: ((state: TState) => TSelected) | MeshPath): TSelected {
    try {
      return createSelector(selectorOrPath)(state);
    } catch (error) {
      throw new SelectorError("StateMesh selector failed.", {
        cause: error,
        metadata: { mesh: name }
      });
    }
  }

  function assertGuardsAllow<TPayload>(kind: "action" | "transaction" | "mutation", operationName: string, payload: TPayload): void {
    if (guards.size === 0) return;

    const context: MeshGuardContext<TState, TPayload> = {
      kind,
      name: operationName,
      payload,
      state,
      mesh
    };

    for (const entry of guards) {
      if (!guardTargetMatches(entry.target, context)) continue;
      const result = entry.handler(context);
      const allowed = result === undefined || result === true || (typeof result === "object" && result.allow !== false);
      if (allowed) continue;

      if (typeof result === "object" && result.error) throw result.error;
      throw new GuardError(typeof result === "object" && result.reason
        ? result.reason
        : `StateMesh guard blocked ${kind} "${operationName}".`, {
        metadata: {
          mesh: name,
          kind,
          name: operationName,
          ...(typeof result === "object" ? result.metadata : undefined)
        }
      });
    }
  }

  function action<TPayload = void, TResult = void>(
    actionName: string,
    handler: (state: TState, payload: TPayload, context: MeshActionContext<TState>) => TResult,
    options: MeshRegistryOptions = {}
  ): MeshAction<TPayload, TResult> {
    assertCanRegister(actions, "action", actionName, options.replace);
    actions.set(actionName, handler as (state: TState, payload: unknown, context: unknown) => unknown);
    const registeredAction = (payload: TPayload) => runAction<TPayload, TResult>(actionName, payload);
    return attachActionRef(registeredAction, actionName);
  }

  function runAction<TPayload = void, TResult = void>(actionName: string, payload: TPayload): TResult {
    assertActive();
    const handler = actions.get(actionName);
    if (!handler) {
      throw new ActionError(`Action "${actionName}" is not registered.`, {
        metadata: { action: actionName }
      });
    }
    assertGuardsAllow("action", actionName, payload);

    const startedAt = Date.now();
    dispatchEvent({
      type: "action.started",
      name: actionName,
      payload: summarizePayload(payload),
      timestamp: startedAt,
      metadata: { mesh: name }
    });

    try {
      const result = batcher.batch(() => {
        const draft = cloneState(state);
        const returned = handler(draft, payload, { name: actionName, mesh });

        // Skip the clone-and-commit cycle when the action didn't actually change
        // state. The shallow equality check is O(n) on top-level keys — negligible
        // compared to structuredClone of the entire state tree.
        if (shallowEqual(state, draft)) {
          return returned;
        }

        commitState(draft, createStateEvent(undefined, { action: actionName }), false);
        return returned;
      });

      dispatchEvent({
        type: "action.completed",
        name: actionName,
        duration: Date.now() - startedAt,
        timestamp: Date.now(),
        metadata: { mesh: name }
      });

      return result as TResult;
    } catch (error) {
      const wrapped = error instanceof ActionError
        ? error
        : new ActionError(`Action "${actionName}" failed.`, {
          cause: error,
          metadata: { action: actionName, payload: summarizePayload(payload) }
        });
      dispatchEvent({
        type: "action.failed",
        name: actionName,
        error: wrapped,
        timestamp: Date.now(),
        metadata: { mesh: name }
      });
      throw wrapped;
    }
  }

  function computed<TValue>(
    computedName: string,
    definition: ComputedDefinition<TState, TValue>,
    options: MeshRegistryOptions = {}
  ): void {
    assertCanRegister(computedEntries, "computed", computedName, options.replace);
    const existing = computedEntries.get(computedName);
    computedEntries.set(computedName, {
      definition: definition as ComputedDefinition<TState, unknown>,
      dirty: true,
      hasValue: false,
      value: undefined,
      depValues: new Map(),
      listeners: existing?.listeners ?? new Set()
    });
  }

  function getComputed<TValue = unknown>(computedName: string): TValue {
    const entry = computedEntries.get(computedName);
    if (!entry) {
      throw new ComputedError(`Computed value "${computedName}" is not registered.`, {
        metadata: { computed: computedName }
      });
    }

    if (!entry.dirty && entry.hasValue && depsStillFresh(entry)) {
      return entry.value as TValue;
    }

    const startedAt = Date.now();
    try {
      const value = entry.definition.compute(state);
      entry.value = value;
      entry.hasValue = true;
      entry.dirty = false;
      entry.depValues = readDependencyValues(entry.definition.deps);
      const finishedAt = Date.now();
      recordProfilerSample({
        id: `profile_${++profilerSampleCounter}`,
        kind: "computed",
        name: computedName,
        status: "success",
        duration: Math.max(0, finishedAt - startedAt),
        startedAt,
        finishedAt,
        slow: finishedAt - startedAt >= profilerSlowThreshold
      });
      return value as TValue;
    } catch (error) {
      const finishedAt = Date.now();
      recordProfilerSample({
        id: `profile_${++profilerSampleCounter}`,
        kind: "computed",
        name: computedName,
        status: "error",
        duration: Math.max(0, finishedAt - startedAt),
        startedAt,
        finishedAt,
        slow: finishedAt - startedAt >= profilerSlowThreshold,
        metadata: { error: getProfilerErrorCode(error) }
      });
      throw new ComputedError(`Computed value "${computedName}" failed.`, {
        cause: error,
        metadata: { computed: computedName }
      });
    }
  }

  function subscribeComputed(computedName: string, listener: () => void): Unsubscribe {
    const entry = computedEntries.get(computedName);
    if (!entry) {
      throw new ComputedError(`Computed value "${computedName}" is not registered.`, {
        metadata: { computed: computedName }
      });
    }

    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }

  function notifyComputed(event?: MeshEvent): void {
    if (event?.type !== "state.changed" && event?.type !== "state.reset") return;

    for (const [computedName, entry] of computedEntries) {
      if (event.type === "state.changed" && !computedShouldInvalidate(entry, event.path)) continue;

      const hadValue = entry.hasValue;
      const previous = entry.value;
      entry.dirty = true;

      if (entry.listeners.size === 0 && !hadValue) continue;

      let next: unknown;
      try {
        next = getComputed(computedName);
      } catch {
        for (const listener of entry.listeners) listener();
        continue;
      }

      const equality = entry.definition.equality ?? Object.is;
      if (!hadValue || !equality(previous, next)) {
        for (const listener of entry.listeners) listener();
      }
    }
  }

  function computedShouldInvalidate(entry: ComputedEntry<TState, unknown>, path?: string): boolean {
    if (!entry.definition.deps?.length || !path) return true;
    return entry.definition.deps.some((dep) => pathsIntersect(dep, path));
  }

  function depsStillFresh(entry: ComputedEntry<TState, unknown>): boolean {
    if (!entry.definition.deps?.length) return !entry.dirty;

    for (const dep of entry.definition.deps) {
      if (!Object.is(entry.depValues.get(dep), getPath(state, dep))) return false;
    }

    return true;
  }

  function readDependencyValues(deps?: readonly string[]): Map<string, unknown> {
    const values = new Map<string, unknown>();
    for (const dep of deps ?? []) {
      values.set(dep, getPath(state, dep));
    }
    return values;
  }

  function transaction<TPayload = void, TResult = unknown>(
    transactionName: string,
    definition: TransactionDefinition<TState, TPayload, TResult>,
    options: TransactionRegistrationOptions = {}
  ): TransactionHandle<TPayload, TResult> {
    const replace = assertCanRegister(transactionDefinitions, "transaction", transactionName, options.replace);
    const existingRuntime = transactionRuntime.get(transactionName);
    if (existingRuntime && replace) {
      existingRuntime.cancelled = true;
      existingRuntime.controller?.abort();
    }
    transactionDefinitions.set(transactionName, definition as TransactionDefinition<TState, unknown, unknown>);
    transactionOptions.set(transactionName, {
      concurrency: options.concurrency ?? "takeLatest",
      replace
    });
    transactionStatuses.set(transactionName, { ...DEFAULT_TRANSACTION_STATUS });
    transactionRuntime.set(transactionName, {
      controller: null,
      cancelled: false,
      runId: null,
      lastPayload: undefined,
      snapshot: null,
      inFlight: null,
      queue: Promise.resolve()
    });

    return createTransactionHandle<TPayload, TResult>(transactionName);
  }

  function createTransactionHandle<TPayload, TResult>(transactionName: string): TransactionHandle<TPayload, TResult> {
    return {
      transactionName,
      kind: "statemesh.transaction",
      run: (payload: TPayload) => runTransaction<TPayload, TResult>(transactionName, payload),
      retry: () => retryTransaction<TResult>(transactionName),
      cancel: () => cancelTransaction(transactionName),
      reset: () => resetTransaction(transactionName),
      get status() {
        return getTransactionStatus<TResult>(transactionName).status;
      },
      get pending() {
        return getTransactionStatus<TResult>(transactionName).pending;
      },
      get success() {
        return getTransactionStatus<TResult>(transactionName).success;
      },
      get error() {
        return getTransactionStatus<TResult>(transactionName).error;
      },
      get data() {
        return getTransactionStatus<TResult>(transactionName).data;
      },
      get startedAt() {
        return getTransactionStatus<TResult>(transactionName).startedAt;
      },
      get finishedAt() {
        return getTransactionStatus<TResult>(transactionName).finishedAt;
      },
      get duration() {
        return getTransactionStatus<TResult>(transactionName).duration;
      },
      get attempts() {
        return getTransactionStatus<TResult>(transactionName).attempts;
      }
    };
  }

  function runTransaction<TPayload = void, TResult = unknown>(transactionName: string, payload: TPayload): Promise<TResult> {
    assertActive();
    const definition = transactionDefinitions.get(transactionName) as TransactionDefinition<TState, TPayload, TResult> | undefined;
    const runtime = transactionRuntime.get(transactionName);

    if (!definition || !runtime) {
      throw new TransactionError(`Transaction "${transactionName}" is not registered.`, {
        metadata: { transaction: transactionName }
      });
    }
    assertGuardsAllow("transaction", transactionName, payload);

    const options = transactionOptions.get(transactionName);
    const concurrency = options?.concurrency ?? "takeLatest";

    if (concurrency === "block" && runtime.inFlight) {
      return Promise.reject(new TransactionError(`Transaction "${transactionName}" is already running.`, {
        code: "STATEMESH_TRANSACTION_BLOCKED",
        metadata: { transaction: transactionName, concurrency }
      }));
    }

    if (concurrency === "queue") {
      const queued = runtime.queue.then(
        () => startTransaction<TPayload, TResult>(transactionName, definition, runtime, payload),
        () => startTransaction<TPayload, TResult>(transactionName, definition, runtime, payload)
      );
      runtime.queue = queued.then(() => undefined, () => undefined);
      return queued;
    }

    if (concurrency === "takeLatest" && runtime.inFlight) {
      runtime.cancelled = true;
      runtime.controller?.abort();
      if (runtime.snapshot) {
        commitState(
          cloneState(runtime.snapshot as TState),
          createStateEvent(undefined, { transaction: transactionName, phase: "superseded" })
        );
      }
    }

    return startTransaction<TPayload, TResult>(transactionName, definition, runtime, payload);
  }

  function startTransaction<TPayload = void, TResult = unknown>(
    transactionName: string,
    definition: TransactionDefinition<TState, TPayload, TResult>,
    runtime: TransactionRuntime,
    payload: TPayload
  ): Promise<TResult> {
    const promise = executeTransaction<TPayload, TResult>(transactionName, definition, runtime, payload);
    runtime.inFlight = promise;
    promise.finally(() => {
      if (runtime.inFlight === promise) {
        runtime.inFlight = null;
      }
    }).catch(() => {
      // The original promise carries the transaction error to the caller.
    });
    return promise;
  }

  async function executeTransaction<TPayload = void, TResult = unknown>(
    transactionName: string,
    definition: TransactionDefinition<TState, TPayload, TResult>,
    runtime: TransactionRuntime,
    payload: TPayload
  ): Promise<TResult> {
    const runId = Symbol(transactionName);
    const startedAt = Date.now();
    const snapshotBefore = cloneState(state);
    runtime.cancelled = false;
    runtime.runId = runId;
    runtime.lastPayload = payload;
    runtime.snapshot = snapshotBefore;

    dispatchEvent({ type: "transaction.started", name: transactionName, timestamp: startedAt, metadata: { mesh: name } });

    let failureHandled = false;

    try {
      const initialController = new AbortController();
      runtime.controller = initialController;
      const beforeContext = createTransactionContext(transactionName, payload, initialController.signal, 0);
      await definition.before?.(state, payload, beforeContext);

      if (definition.optimistic) {
        applyDraft((draft) => {
          definition.optimistic?.(draft, payload, beforeContext);
        }, createStateEvent(undefined, { transaction: transactionName, phase: "optimistic" }));
        dispatchEvent({ type: "transaction.optimistic", name: transactionName, timestamp: Date.now(), metadata: { mesh: name } });
      }

      setTransactionStatus(transactionName, {
        status: "pending",
        pending: true,
        success: false,
        error: null,
        data: null,
        startedAt,
        finishedAt: null,
        duration: null,
        attempts: 0
      });

      const maxAttempts = Math.max(1, 1 + (definition.retry?.attempts ?? 0));
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (runtime.runId !== runId || runtime.cancelled) {
          throw new TransactionError(`Transaction "${transactionName}" was cancelled.`, {
            code: "STATEMESH_TRANSACTION_CANCELLED",
            metadata: { transaction: transactionName }
          });
        }

        const controller = new AbortController();
        runtime.controller = controller;
        const context = createTransactionContext(transactionName, payload, controller.signal, attempt);
        setTransactionStatus(transactionName, { attempts: attempt });
        dispatchEvent({
          type: "transaction.effect.started",
          name: transactionName,
          attempt,
          timestamp: Date.now(),
          metadata: { mesh: name }
        });

        try {
          const result = await runEffectWithTimeout(definition, payload, context, controller);
          if (runtime.runId !== runId || runtime.cancelled) {
            throw new TransactionError(`Transaction "${transactionName}" was cancelled.`, {
              code: "STATEMESH_TRANSACTION_CANCELLED",
              metadata: { transaction: transactionName }
            });
          }

          if (definition.commit) {
            applyDraft((draft) => {
              definition.commit?.(draft, result, payload, context);
            }, createStateEvent(undefined, { transaction: transactionName, phase: "commit" }));
          }

          const finishedAt = Date.now();
          setTransactionStatus(transactionName, {
            status: "success",
            pending: false,
            success: true,
            error: null,
            data: result,
            finishedAt,
            duration: finishedAt - startedAt
          });
          dispatchEvent({
            type: "transaction.committed",
            name: transactionName,
            duration: finishedAt - startedAt,
            timestamp: finishedAt,
            metadata: { mesh: name }
          });
          return result;
        } catch (error) {
          lastError = toError(error);
          if (runtime.cancelled || runtime.runId !== runId) {
            break;
          }

          if (attempt < maxAttempts) {
            await delay(getRetryDelay(definition.retry?.delay, attempt, lastError));
            continue;
          }
        }
      }

      const finalError = lastError ?? new TransactionError(`Transaction "${transactionName}" failed.`, {
        metadata: { transaction: transactionName }
      });
      if (runtime.runId !== runId) {
        throw finalError;
      }
      failureHandled = true;
      await handleTransactionFailure(transactionName, definition, payload, finalError, startedAt, runtime.cancelled, snapshotBefore);
      throw finalError instanceof TransactionError
        ? finalError
        : new TransactionError(`Transaction "${transactionName}" failed.`, {
          cause: finalError,
          metadata: { transaction: transactionName, payload: summarizePayload(payload) }
        });
    } catch (error) {
      const wrapped = toError(error);
      const cancelled = runtime.cancelled || wrapped.code === "STATEMESH_TRANSACTION_CANCELLED";
      const superseded = runtime.runId !== runId;
      if (!superseded && !failureHandled) {
        failureHandled = true;
        await handleTransactionFailure(transactionName, definition, payload, wrapped, startedAt, cancelled, snapshotBefore);
      }
      throw wrapped instanceof TransactionError
        ? wrapped
        : new TransactionError(`Transaction "${transactionName}" failed.`, {
          cause: wrapped,
          metadata: { transaction: transactionName, payload: summarizePayload(payload) }
        });
    } finally {
      if (runtime.runId === runId) {
        runtime.controller = null;
        runtime.inFlight = null;
      }
    }
  }

  async function runEffectWithTimeout<TPayload, TResult>(
    definition: TransactionDefinition<TState, TPayload, TResult>,
    payload: TPayload,
    context: TransactionContext<TState, TPayload>,
    controller: AbortController
  ): Promise<TResult> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    if (definition.timeout && definition.timeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, definition.timeout);
    }

    try {
      const result = await definition.effect?.(state, payload, context);
      return result as TResult;
    } catch (error) {
      if (timedOut) {
        throw new TransactionError(`Transaction "${context.name}" timed out after ${definition.timeout}ms.`, {
          code: "STATEMESH_TRANSACTION_TIMEOUT",
          cause: error,
          metadata: { transaction: context.name, timeout: definition.timeout }
        });
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async function handleTransactionFailure<TPayload, TResult>(
    transactionName: string,
    definition: TransactionDefinition<TState, TPayload, TResult>,
    payload: TPayload,
    error: Error,
    startedAt: number,
    cancelled: boolean,
    snapshotState: TState
  ): Promise<void> {
    const runtime = transactionRuntime.get(transactionName);
    const controller = runtime?.controller ?? new AbortController();
    const context = createTransactionContext(transactionName, payload, controller.signal, getTransactionStatus(transactionName).attempts);

    if (definition.rollback && snapshotState) {
      try {
        if (definition.rollback === true) {
          commitState(cloneState(snapshotState), createStateEvent(undefined, { transaction: transactionName, phase: "rollback" }));
        } else {
          applyDraft((draft) => {
            if (typeof definition.rollback === "function") {
              definition.rollback(draft, error, payload, context);
            }
          }, createStateEvent(undefined, { transaction: transactionName, phase: "rollback" }));
        }
        dispatchEvent({ type: "transaction.rollback", name: transactionName, timestamp: Date.now(), metadata: { mesh: name } });
      } catch (rollbackError) {
        throw new TransactionRollbackError(`Rollback for transaction "${transactionName}" failed.`, {
          cause: rollbackError,
          metadata: { transaction: transactionName }
        });
      }
    }

    if (!cancelled && definition.onError) {
      applyDraft((draft) => {
        definition.onError?.(draft, error, payload, context);
      }, createStateEvent(undefined, { transaction: transactionName, phase: "onError" }));
    }

    const finishedAt = Date.now();
    setTransactionStatus(transactionName, {
      status: cancelled ? "cancelled" : "error",
      pending: false,
      success: false,
      error,
      finishedAt,
      duration: finishedAt - startedAt
    });

    dispatchEvent(
      cancelled
        ? { type: "transaction.cancelled", name: transactionName, timestamp: finishedAt, metadata: { mesh: name } }
        : { type: "transaction.failed", name: transactionName, error, timestamp: finishedAt, metadata: { mesh: name } }
    );
  }

  function createTransactionContext<TPayload>(
    transactionName: string,
    payload: TPayload,
    signal: AbortSignal,
    attempt: number
  ): TransactionContext<TState, TPayload> {
    return {
      name: transactionName,
      payload,
      signal,
      attempt,
      mesh
    };
  }

  // Stable reference cache for status objects — avoids creating new objects on every
  // read when nothing changed. Each status setter stores a new object, so identity
  // checks (===) reliably detect actual changes.
  function getTransactionStatus<TResult = unknown>(transactionName: string): TransactionStatus<TResult> {
    return transactionStatuses.get(transactionName) ?? DEFAULT_TRANSACTION_STATUS as unknown as TransactionStatus<TResult>;
  }

  function setTransactionStatus(transactionName: string, partial: Partial<TransactionStatus>): void {
    const current = transactionStatuses.get(transactionName) ?? DEFAULT_TRANSACTION_STATUS;
    const status = normalizeTransactionStatus({ ...current, ...partial });
    transactionStatuses.set(transactionName, status);
    for (const listener of transactionListeners.get(transactionName) ?? []) {
      listener();
    }
  }

  function normalizeTransactionStatus(status: TransactionStatus): TransactionStatus {
    return {
      ...status,
      pending: status.status === "pending",
      success: status.status === "success"
    };
  }

  function subscribeTransaction(transactionName: string, listener: () => void): Unsubscribe {
    let listeners = transactionListeners.get(transactionName);
    if (!listeners) {
      listeners = new Set();
      transactionListeners.set(transactionName, listeners);
    }
    listeners.add(listener);
    return () => listeners?.delete(listener);
  }

  function cancelTransaction(transactionName: string): void {
    const runtime = transactionRuntime.get(transactionName);
    if (!runtime) return;
    runtime.cancelled = true;
    runtime.controller?.abort();
    setTransactionStatus(transactionName, {
      status: "cancelled",
      pending: false,
      success: false,
      finishedAt: Date.now()
    });
  }

  function resetTransaction(transactionName: string): void {
    transactionStatuses.set(transactionName, { ...DEFAULT_TRANSACTION_STATUS });
    for (const listener of transactionListeners.get(transactionName) ?? []) {
      listener();
    }
  }

  function retryTransaction<TResult = unknown>(transactionName: string): Promise<TResult> {
    const runtime = transactionRuntime.get(transactionName);
    return runTransaction(transactionName, runtime?.lastPayload) as Promise<TResult>;
  }

  function resource<TParams = void, TData = unknown, TPageParam = unknown>(
    resourceName: string,
    definition: ResourceDefinition<TState, TParams, TData, TPageParam>,
    options: MeshRegistryOptions = {}
  ): ResourceHandle<TParams, TData> {
    assertCanRegister(resourceDefinitions, "resource", resourceName, options.replace);
    resourceDefinitions.set(resourceName, definition as ResourceDefinition<TState, unknown, unknown, unknown>);
    return createResourceHandle<TParams, TData>(resourceName);
  }

  function createResourceHandle<TParams, TData>(resourceName: string): ResourceHandle<TParams, TData> {
    return {
      resourceName,
      kind: "statemesh.resource",
      fetch: (params?: TParams, fetchOptions?: ResourceFetchOptions) =>
        fetchResource<TParams, TData>(resourceName, params, fetchOptions),
      preload: (params?: TParams, fetchOptions?: ResourceFetchOptions) =>
        fetchResource<TParams, TData>(resourceName, params, { ...fetchOptions, force: false }),
      prefetch: (params?: TParams, fetchOptions?: ResourceFetchOptions) =>
        prefetchResource<TParams, TData>(resourceName, params, fetchOptions),
      fetchNextPage: (params?: TParams, fetchOptions?: ResourceFetchOptions) =>
        fetchNextResourcePage<TParams, TData>(resourceName, params, fetchOptions),
      get: (params?: TParams) => getResourceStatus<TData, TParams>(resourceName, params),
      setData: (params, updater, setOptions) => setResourceData<TData, TParams>(resourceName, params, updater, setOptions),
      invalidate: (invalidation?: ResourceInvalidation) =>
        invalidateResources(normalizeHandleInvalidation(resourceName, invalidation)),
      subscribe: (listener, params?: TParams) => subscribeResource(resourceName, listener, { params })
    };
  }

  function fetchResource<TParams = void, TData = unknown>(
    resourceName: string,
    params?: TParams,
    fetchOptions: ResourceFetchOptions = {}
  ): Promise<TData> {
    return fetchResourceInternal<TParams, TData>(resourceName, params, fetchOptions, false);
  }

  function prefetchResource<TParams = void, TData = unknown>(
    resourceName: string,
    params?: TParams,
    fetchOptions: ResourceFetchOptions = {}
  ): Promise<TData> {
    return fetchResourceInternal<TParams, TData>(resourceName, params, { ...fetchOptions, force: false }, false);
  }

  function fetchNextResourcePage<TParams = void, TData = unknown>(
    resourceName: string,
    params?: TParams,
    fetchOptions: ResourceFetchOptions = {}
  ): Promise<TData> {
    const definition = getResourceDefinition<TParams, TData>(resourceName);
    const key = getResourceCacheKey(resourceName, definition, params);
    const entry = ensureResourceEntry(resourceName, key, params, definition);
    const lastPage = entry.pages.length > 0 ? entry.pages[entry.pages.length - 1] as TData : entry.data as TData | null;
    const pageParam = fetchOptions.pageParam ?? (
      lastPage !== null && lastPage !== undefined
        ? definition.getNextPageParam?.(lastPage, entry.pages as TData[], params as TParams)
        : undefined
    );

    if (pageParam === null || pageParam === undefined) {
      return Promise.reject(new ResourceError(`Resource "${resourceName}" does not have another page.`, {
        metadata: { resource: resourceName, key }
      }));
    }

    return fetchResourceInternal<TParams, TData>(
      resourceName,
      params,
      { ...fetchOptions, pageParam, append: true, force: true },
      true
    );
  }

  function fetchResourceInternal<TParams = void, TData = unknown>(
    resourceName: string,
    params: TParams | undefined,
    fetchOptions: ResourceFetchOptions,
    append: boolean
  ): Promise<TData> {
    assertActive();
    const definition = getResourceDefinition<TParams, TData>(resourceName);
    const key = getResourceCacheKey(resourceName, definition, params);
    const entry = ensureResourceEntry(resourceName, key, params, definition);

    if (!fetchOptions.force && entry.status === "success" && !isResourceEntryStale(entry, definition) && !append) {
      return Promise.resolve(entry.data as TData);
    }

    if (definition.dedupe !== false && entry.inFlight && !fetchOptions.force) {
      return entry.inFlight as Promise<TData>;
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    entry.controller = controller;
    entry.startedAt = startedAt;
    entry.error = null;
    entry.fetching = true;
    entry.pending = entry.status === "idle" || (!fetchOptions.background && !definition.keepPreviousData && !entry.data);
    entry.status = entry.pending ? "loading" : entry.status;
    notifyResourceEntry(entry);

    dispatchEvent({
      type: "resource.fetch.started",
      name: resourceName,
      key,
      timestamp: startedAt,
      metadata: { mesh: name, ...fetchOptions.metadata }
    });

    const pageIndex = append ? entry.pages.length : 0;
    const context: ResourceFetchContext<TState, TParams, unknown> = {
      name: resourceName,
      key,
      params: params as TParams,
      signal: controller.signal,
      mesh,
      pageParam: fetchOptions.pageParam,
      pageIndex,
      metadata: fetchOptions.metadata
    };

    const promise = Promise.resolve()
      .then(() => definition.fetch(params as TParams, context))
      .then((result) => {
        const finishedAt = Date.now();
        const nextPages = append ? [...entry.pages, result] : [result];
        const nextPageParams = append ? [...entry.pageParams, fetchOptions.pageParam] : [fetchOptions.pageParam];
        const data = append && definition.mergePages
          ? definition.mergePages(nextPages as TData[], params as TParams)
          : result;

        entry.status = "success";
        entry.pending = false;
        entry.fetching = false;
        entry.stale = false;
        entry.data = data;
        entry.error = null;
        entry.pages = nextPages;
        entry.pageParams = nextPageParams;
        entry.tags = normalizeResourceTags(resolveResourceTags(definition, data as TData, params as TParams));
        entry.finishedAt = finishedAt;
        entry.duration = finishedAt - startedAt;
        entry.updatedAt = finishedAt;
        entry.inFlight = null;
        scheduleResourceGc(entry, definition);
        notifyResourceEntry(entry);
        dispatchEvent({
          type: "resource.fetch.succeeded",
          name: resourceName,
          key,
          duration: finishedAt - startedAt,
          timestamp: finishedAt,
          metadata: { mesh: name, tags: entry.tags, ...fetchOptions.metadata }
        });
        return result as TData;
      })
      .catch((error) => {
        const wrapped = error instanceof ResourceError
          ? error
          : new ResourceError(`Resource "${resourceName}" failed to fetch.`, {
            cause: error,
            metadata: { resource: resourceName, key }
          });
        entry.status = entry.data === null || entry.data === undefined ? "error" : entry.status;
        entry.pending = false;
        entry.fetching = false;
        entry.error = wrapped;
        entry.finishedAt = Date.now();
        entry.duration = entry.finishedAt - startedAt;
        entry.inFlight = null;
        notifyResourceEntry(entry);
        dispatchEvent({
          type: "resource.fetch.failed",
          name: resourceName,
          key,
          error: wrapped,
          timestamp: Date.now(),
          metadata: { mesh: name, ...fetchOptions.metadata }
        });
        throw wrapped;
      });

    entry.inFlight = promise;
    return promise;
  }

  function getResourceStatus<TData = unknown, TParams = unknown>(resourceName: string, params?: TParams): ResourceStatus<TData, TParams> {
    const definition = getResourceDefinition<TParams, TData>(resourceName);
    const key = getResourceCacheKey(resourceName, definition, params);
    const entry = ensureResourceEntry(resourceName, key, params, definition);
    const cacheKey = `${resourceName}::${key}`;
    const cached = lastResourceStatuses.get(cacheKey);

    if (cached && cached.startedAt === entry.startedAt && cached.finishedAt === entry.finishedAt && cached.status === entry.status && cached.stale === entry.stale && cached.data === entry.data && cached.error === entry.error && cached.pending === entry.pending && cached.fetching === entry.fetching && cached.updatedAt === entry.updatedAt) {
      return cached as ResourceStatus<TData, TParams>;
    }

    const status = createResourceStatus<TData, TParams>(entry, definition);
    lastResourceStatuses.set(cacheKey, status);
    return status;
  }

  function setResourceData<TData = unknown, TParams = unknown>(
    resourceName: string,
    params: TParams | undefined,
    updater: TData | ((current: TData | null) => TData),
    setOptions: ResourceSetDataOptions = {}
  ): void {
    const definition = getResourceDefinition<TParams, TData>(resourceName);
    const key = getResourceCacheKey(resourceName, definition, params);
    const entry = ensureResourceEntry(resourceName, key, params, definition);
    const current = (entry.data ?? null) as TData | null;
    const nextData = typeof updater === "function"
      ? (updater as (current: TData | null) => TData)(current)
      : updater;
    const now = Date.now();

    entry.status = "success";
    entry.pending = false;
    entry.fetching = false;
    entry.stale = setOptions.stale ?? false;
    entry.data = nextData;
    entry.error = null;
    entry.pages = [nextData];
    entry.pageParams = [undefined];
    entry.tags = normalizeResourceTags(setOptions.tags ?? resolveResourceTags(definition, nextData, params as TParams));
    entry.updatedAt = now;
    entry.finishedAt = now;
    entry.duration = 0;
    scheduleResourceGc(entry, definition);
    notifyResourceEntry(entry);
    dispatchEvent({
      type: "resource.fetch.succeeded",
      name: resourceName,
      key,
      duration: 0,
      timestamp: now,
      metadata: { mesh: name, source: "setData", ...setOptions.metadata }
    });
  }

  async function invalidateResources(invalidation?: ResourceInvalidation): Promise<void> {
    const normalized = normalizeInvalidation(invalidation);
    const refetches: Array<Promise<unknown>> = [];
    const affectedTags = normalizeResourceTags(normalized.tags);

    for (const entry of resourceEntries.values()) {
      const definition = resourceDefinitions.get(entry.name);
      if (!definition || !resourceEntryMatchesInvalidation(entry, normalized)) continue;
      entry.stale = true;
      notifyResourceEntry(entry);
      dispatchEvent({
        type: "resource.invalidated",
        name: entry.name,
        key: entry.key,
        tags: affectedTags.length > 0 ? affectedTags : entry.tags,
        timestamp: Date.now(),
        metadata: { mesh: name, ...normalized.metadata }
      });

      const listenerCount = resourceListeners.get(entry.key)?.size ?? 0;
      const shouldRefetch = normalized.refetch === true || (normalized.refetch === "active" && listenerCount > 0);
      if (shouldRefetch) {
        refetches.push(fetchResourceInternal(entry.name, entry.params, {
          force: true,
          background: true,
          metadata: normalized.metadata
        }, false).catch(() => undefined));
      }
    }

    await Promise.all(refetches);
  }

  function subscribeResource(resourceName: string, listener: () => void, subscribeOptions: ResourceSubscribeOptions = {}): Unsubscribe {
    const definition = getResourceDefinition<unknown, unknown>(resourceName);
    const key = getResourceCacheKey(resourceName, definition, subscribeOptions.params);
    ensureResourceEntry(resourceName, key, subscribeOptions.params, definition);
    let listeners = resourceListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      resourceListeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) resourceListeners.delete(key);
    };
  }

  function dehydrateResources(dehydrateOptions: ResourceDehydrateOptions = {}): ResourceSnapshot {
    const entries: ResourceSnapshotEntry[] = [];
    for (const entry of resourceEntries.values()) {
      if (entry.status !== "success") continue;
      const definition = resourceDefinitions.get(entry.name);
      if (!definition) continue;
      const status = createResourceStatus(entry, definition);
      if (!resourceStatusMatchesFilter(status, dehydrateOptions)) continue;
      entries.push({
        name: entry.name,
        key: entry.key,
        params: cloneState(entry.params),
        data: cloneState(entry.data),
        tags: [...entry.tags],
        pages: cloneState(entry.pages),
        pageParams: cloneState(entry.pageParams),
        stale: entry.stale,
        updatedAt: entry.updatedAt,
        finishedAt: entry.finishedAt
      });
    }

    return {
      version: 1,
      createdAt: Date.now(),
      entries
    };
  }

  function hydrateResources(snapshot: ResourceSnapshot, hydrateOptions: ResourceHydrateOptions = {}): void {
    const skipMissing = hydrateOptions.skipMissing ?? true;
    let hydrated = 0;
    for (const snapshotEntry of snapshot.entries ?? []) {
      const definition = resourceDefinitions.get(snapshotEntry.name);
      if (!definition) {
        if (skipMissing) continue;
        throw new ResourceError(`Cannot hydrate missing resource "${snapshotEntry.name}".`, {
          metadata: { resource: snapshotEntry.name }
        });
      }

      const entry: ResourceEntry = {
        name: snapshotEntry.name,
        key: snapshotEntry.key,
        params: cloneState(snapshotEntry.params),
        status: "success",
        pending: false,
        fetching: false,
        stale: hydrateOptions.stale ?? snapshotEntry.stale,
        data: cloneState(snapshotEntry.data),
        error: null,
        tags: [...snapshotEntry.tags],
        pages: cloneState(snapshotEntry.pages),
        pageParams: cloneState(snapshotEntry.pageParams),
        startedAt: null,
        finishedAt: snapshotEntry.finishedAt,
        duration: null,
        updatedAt: snapshotEntry.updatedAt,
        controller: null,
        inFlight: null,
        gcTimer: null
      };
      resourceEntries.set(snapshotEntry.key, entry);
      scheduleResourceGc(entry, definition);
      notifyResourceEntry(entry);
      hydrated += 1;
    }

    if (hydrated > 0) {
      dispatchEvent({
        type: "resource.hydrated",
        count: hydrated,
        timestamp: Date.now(),
        metadata: { mesh: name, ...hydrateOptions.metadata }
      });
    }
  }

  function persistResources(persistOptions: ResourcePersistOptions = {}): Unsubscribe {
    const storageKey = persistOptions.key ?? `${name}:resources`;
    const serializer = persistOptions.serializer ?? JSON.stringify;
    const deserializer = persistOptions.deserializer ?? JSON.parse;
    const storage = resolveStorageAdapter(persistOptions.storage ?? "localStorage");
    const version = persistOptions.version ?? 1;
    const ttl = parseDurationOptional(persistOptions.ttl);

    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const envelope = deserializer(raw) as {
          version?: number;
          expiresAt?: number | null;
          snapshot?: ResourceSnapshot;
        };
        if (!envelope.expiresAt || envelope.expiresAt > Date.now()) {
          let snapshot = envelope.snapshot;
          if (snapshot && envelope.version !== undefined && envelope.version !== version && persistOptions.migrate) {
            snapshot = persistOptions.migrate(snapshot, envelope.version);
          }
          if (snapshot) hydrateResources(snapshot, { metadata: persistOptions.metadata });
        } else {
          storage.removeItem(storageKey);
        }
      }
    } catch (error) {
      const wrapped = new ResourceError("StateMesh resource cache restore failed; persisted resource data was ignored.", {
        cause: error,
        metadata: { key: storageKey }
      });
      persistOptions.onError?.(wrapped);
      dispatchEvent({ type: "resource.persist.failed", error: wrapped, timestamp: Date.now(), metadata: persistOptions.metadata });
    }

    const save = () => {
      try {
        const snapshot = dehydrateResources(persistOptions);
        const envelope = {
          version,
          updatedAt: Date.now(),
          expiresAt: ttl ? Date.now() + ttl : null,
          snapshot
        };
        storage.setItem(storageKey, serializer(envelope));
        dispatchEvent({
          type: "resource.persisted",
          count: snapshot.entries.length,
          timestamp: Date.now(),
          metadata: { key: storageKey, ...persistOptions.metadata }
        });
      } catch (error) {
        const wrapped = new ResourceError("StateMesh resource cache save failed.", {
          cause: error,
          metadata: { key: storageKey }
        });
        persistOptions.onError?.(wrapped);
        dispatchEvent({ type: "resource.persist.failed", error: wrapped, timestamp: Date.now(), metadata: persistOptions.metadata });
      }
    };

    const saveWithThrottle = persistOptions.throttle ? debounce(save, persistOptions.throttle) : save;
    const listener = () => saveWithThrottle();
    resourceChangeListeners.add(listener);
    saveWithThrottle();

    return () => {
      if (hasCancel(saveWithThrottle)) saveWithThrottle.cancel();
      resourceChangeListeners.delete(listener);
    };
  }

  function dehydrate(dehydrateOptions: MeshDehydrateOptions = {}): MeshDehydratedSnapshot {
    const snapshot: MeshDehydratedSnapshot = {
      version: 1,
      name,
      createdAt: Date.now()
    };

    if (dehydrateOptions.state !== false) snapshot.state = cloneState(state);
    if (dehydrateOptions.resources !== false) snapshot.resources = dehydrateResources(dehydrateOptions);
    if (dehydrateOptions.urlStates !== false) {
      snapshot.urlStates = {};
      for (const [urlName, entry] of urlStates) {
        snapshot.urlStates[urlName] = cloneState(entry.values);
      }
    }
    if (dehydrateOptions.forms) {
      snapshot.forms = {};
      for (const [formName, entry] of formEntries) {
        snapshot.forms[formName] = cloneState(entry.state.values);
      }
    }
    if (dehydrateOptions.queuedMutations !== false) {
      snapshot.queuedMutations = getQueuedMutations();
    }

    return snapshot;
  }

  function hydrate(snapshot: MeshDehydratedSnapshot, hydrateOptions: MeshHydrateOptions = {}): void {
    if (hydrateOptions.state !== false && snapshot.state !== undefined) {
      state = hydrateOptions.mergeState
        ? normalizeSetStateResult(snapshot.state as Partial<TState>, false)
        : cloneState(snapshot.state as TState);
      queueEvent({ type: "state.changed", timestamp: Date.now(), metadata: { mesh: name, source: "hydrate", ...hydrateOptions.metadata } });
      batcher.schedule();
    }

    if (hydrateOptions.resources !== false && snapshot.resources) {
      hydrateResources(snapshot.resources, hydrateOptions);
    }

    if (hydrateOptions.urlStates !== false && snapshot.urlStates) {
      for (const [urlName, values] of Object.entries(snapshot.urlStates)) {
        const entry = urlStates.get(urlName);
        if (!entry || !values || typeof values !== "object") continue;
        entry.values = cloneState(values as Record<string, unknown>);
        entry.write(entry.values);
        for (const listener of entry.listeners) listener();
        dispatchEvent({ type: "url.changed", name: urlName, timestamp: Date.now(), metadata: { source: "hydrate", ...hydrateOptions.metadata } });
      }
    }

    if (hydrateOptions.forms && snapshot.forms) {
      for (const [formName, values] of Object.entries(snapshot.forms)) {
        const entry = formEntries.get(formName);
        if (!entry || !values || typeof values !== "object") continue;
        resetForm(entry, formName, values as Record<string, unknown>);
      }
    }

    if (hydrateOptions.queuedMutations !== false && snapshot.queuedMutations) {
      restoreQueuedMutations(snapshot.queuedMutations, hydrateOptions.metadata);
    }

    dispatchEvent({ type: "mesh.hydrated", timestamp: Date.now(), metadata: { mesh: name, ...hydrateOptions.metadata } });
  }

  function mutation<TPayload = void, TResult = unknown>(
    mutationName: string,
    definition: MutationDefinition<TState, TPayload, TResult>,
    options: MeshRegistryOptions = {}
  ): MutationHandle<TPayload, TResult> {
    const replace = assertCanRegister(mutationDefinitions, "mutation", mutationName, options.replace);
    const runtime = mutationRuntime.get(mutationName);
    if (runtime && replace) runtime.controller?.abort();
    mutationDefinitions.set(mutationName, definition as MutationDefinition<TState, unknown, unknown>);
    mutationStatuses.set(mutationName, { ...DEFAULT_MUTATION_STATUS });
    mutationRuntime.set(mutationName, {
      controller: null,
      inFlight: null,
      queue: Promise.resolve(),
      lastPayload: undefined
    });
    return createMutationHandle<TPayload, TResult>(mutationName);
  }

  function createMutationHandle<TPayload, TResult>(mutationName: string): MutationHandle<TPayload, TResult> {
    return {
      mutationName,
      kind: "statemesh.mutation",
      run: (payload: TPayload) => runMutation<TPayload, TResult>(mutationName, payload),
      reset: () => resetMutation(mutationName),
      get status() {
        return getMutationStatus<TResult>(mutationName).status;
      },
      get pending() {
        return getMutationStatus<TResult>(mutationName).pending;
      },
      get queued() {
        return getMutationStatus<TResult>(mutationName).queued;
      },
      get success() {
        return getMutationStatus<TResult>(mutationName).success;
      },
      get data() {
        return getMutationStatus<TResult>(mutationName).data;
      },
      get error() {
        return getMutationStatus<TResult>(mutationName).error;
      },
      get lastPayload() {
        return getMutationStatus<TResult>(mutationName).lastPayload;
      },
      get startedAt() {
        return getMutationStatus<TResult>(mutationName).startedAt;
      },
      get finishedAt() {
        return getMutationStatus<TResult>(mutationName).finishedAt;
      },
      get duration() {
        return getMutationStatus<TResult>(mutationName).duration;
      },
      get runs() {
        return getMutationStatus<TResult>(mutationName).runs;
      },
      get queueSize() {
        return getMutationStatus<TResult>(mutationName).queueSize;
      }
    };
  }

  function runMutation<TPayload = void, TResult = unknown>(mutationName: string, payload: TPayload): Promise<TResult> {
    assertActive();
    const definition = mutationDefinitions.get(mutationName) as MutationDefinition<TState, TPayload, TResult> | undefined;
    const runtime = mutationRuntime.get(mutationName);
    if (!definition || !runtime) {
      throw new MutationError(`Mutation "${mutationName}" is not registered.`, {
        metadata: { mutation: mutationName }
      });
    }
    assertGuardsAllow("mutation", mutationName, payload);

    if (shouldQueueMutation(definition)) {
      return queueOfflineMutation<TPayload, TResult>(mutationName, payload);
    }

    const concurrency = definition.concurrency ?? "block";
    if (concurrency === "block" && runtime.inFlight) {
      return Promise.reject(new MutationError(`Mutation "${mutationName}" is already running.`, {
        code: "STATEMESH_MUTATION_BLOCKED",
        metadata: { mutation: mutationName, concurrency }
      }));
    }

    if (concurrency === "queue") {
      const queued = runtime.queue.then(
        () => startMutation(mutationName, definition, runtime, payload),
        () => startMutation(mutationName, definition, runtime, payload)
      );
      runtime.queue = queued.then(() => undefined, () => undefined);
      return queued;
    }

    if (concurrency === "takeLatest" && runtime.inFlight) {
      runtime.controller?.abort();
    }

    return startMutation(mutationName, definition, runtime, payload);
  }

  function startMutation<TPayload, TResult>(
    mutationName: string,
    definition: MutationDefinition<TState, TPayload, TResult>,
    runtime: MutationRuntime,
    payload: TPayload
  ): Promise<TResult> {
    const promise = executeMutation(mutationName, definition, runtime, payload);
    runtime.inFlight = promise;
    promise.finally(() => {
      if (runtime.inFlight === promise) runtime.inFlight = null;
    }).catch(() => {
      // The original promise carries the mutation error to the caller.
    });
    return promise;
  }

  async function executeMutation<TPayload, TResult>(
    mutationName: string,
    definition: MutationDefinition<TState, TPayload, TResult>,
    runtime: MutationRuntime,
    payload: TPayload
  ): Promise<TResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const stateSnapshot = cloneState(state);
    const resourceSnapshot = cloneResourceEntries();
    runtime.controller = controller;
    runtime.lastPayload = payload;
    const context = createMutationContext(mutationName, payload, controller.signal);

    setMutationStatus(mutationName, {
      status: "pending",
      pending: true,
      success: false,
      error: null,
      lastPayload: payload,
      startedAt,
      finishedAt: null,
      duration: null,
      runs: (mutationStatuses.get(mutationName)?.runs ?? 0) + 1
    });
    dispatchEvent({
      type: "mutation.started",
      name: mutationName,
      payload: summarizePayload(payload),
      timestamp: startedAt,
      metadata: { mesh: name }
    });

    try {
      if (definition.optimistic) {
        await applyDraftAsync((draft) => definition.optimistic?.(draft, payload, context), createStateEvent(undefined, {
          mutation: mutationName,
          phase: "optimistic"
        }));
        dispatchEvent({ type: "mutation.optimistic", name: mutationName, timestamp: Date.now(), metadata: { mesh: name } });
      }

      const result = await definition.mutate(payload, context);

      if (definition.commit) {
        await applyDraftAsync((draft) => definition.commit?.(draft, result, payload, context), createStateEvent(undefined, {
          mutation: mutationName,
          phase: "commit"
        }));
      }

      await definition.onSuccess?.(result, payload, context);
      const invalidationTags = typeof definition.invalidate === "function"
        ? definition.invalidate(result, payload)
        : definition.invalidate;
      if (invalidationTags?.length) {
        await invalidateResources({ tags: invalidationTags, refetch: definition.refetch ?? "active" });
      }

      const finishedAt = Date.now();
      setMutationStatus(mutationName, {
        status: "success",
        pending: false,
        success: true,
        data: result,
        error: null,
        finishedAt,
        duration: finishedAt - startedAt
      });
      dispatchEvent({
        type: "mutation.succeeded",
        name: mutationName,
        duration: finishedAt - startedAt,
        timestamp: finishedAt,
        metadata: { mesh: name }
      });
      return result;
    } catch (error) {
      const wrapped = error instanceof MutationError
        ? error
        : new MutationError(`Mutation "${mutationName}" failed.`, {
          cause: error,
          metadata: { mutation: mutationName, payload: summarizePayload(payload) }
        });

      const shouldRollback = definition.rollback === true || (definition.rollback === undefined && Boolean(definition.optimistic));
      if (shouldRollback) {
        restoreResourceEntries(resourceSnapshot);
        commitState(cloneState(stateSnapshot), createStateEvent(undefined, { mutation: mutationName, phase: "rollback" }));
        dispatchEvent({ type: "mutation.rollback", name: mutationName, timestamp: Date.now(), metadata: { mesh: name } });
      } else if (typeof definition.rollback === "function") {
        await applyDraftAsync((draft) => definition.rollback instanceof Function
          ? definition.rollback(draft, wrapped, payload, context)
          : undefined, createStateEvent(undefined, { mutation: mutationName, phase: "rollback" }));
      }

      await definition.onError?.(wrapped, payload, context);
      const finishedAt = Date.now();
      setMutationStatus(mutationName, {
        status: "error",
        pending: false,
        success: false,
        error: wrapped,
        finishedAt,
        duration: finishedAt - startedAt
      });
      dispatchEvent({
        type: "mutation.failed",
        name: mutationName,
        error: wrapped,
        timestamp: finishedAt,
        metadata: { mesh: name }
      });
      throw wrapped;
    } finally {
      runtime.controller = null;
    }
  }

  function getMutationStatus<TResult = unknown>(mutationName: string): MutationStatus<TResult> {
    return mutationStatuses.get(mutationName) ?? DEFAULT_MUTATION_STATUS as unknown as MutationStatus<TResult>;
  }

  function setMutationStatus(mutationName: string, partial: Partial<MutationStatus>): void {
    const current = mutationStatuses.get(mutationName) ?? DEFAULT_MUTATION_STATUS;
    const status = normalizeMutationStatus({ ...current, ...partial });
    mutationStatuses.set(mutationName, status);
    for (const listener of mutationListeners.get(mutationName) ?? []) listener();
    notifyDevtools();
  }

  function normalizeMutationStatus(status: MutationStatus): MutationStatus {
    return {
      ...status,
      pending: status.status === "pending",
      queued: status.status === "queued" || status.queueSize > 0,
      success: status.status === "success"
    };
  }

  function subscribeMutation(mutationName: string, listener: () => void): Unsubscribe {
    let listeners = mutationListeners.get(mutationName);
    if (!listeners) {
      listeners = new Set();
      mutationListeners.set(mutationName, listeners);
    }
    listeners.add(listener);
    return () => listeners?.delete(listener);
  }

  function resetMutation(mutationName: string): void {
    mutationStatuses.set(mutationName, { ...DEFAULT_MUTATION_STATUS });
    for (const listener of mutationListeners.get(mutationName) ?? []) listener();
    notifyDevtools();
  }

  function getQueuedMutations(): QueuedMutation[] {
    return queuedMutations.map(({ resolve: _resolve, reject: _reject, ...queued }) => ({
      ...queued,
      payload: cloneState(queued.payload)
    }));
  }

  async function runQueuedMutations(): Promise<void> {
    if (isOffline()) return;
    let flushed = 0;
    while (queuedMutations.length > 0) {
      const queued = queuedMutations.shift();
      if (!queued) continue;
      const definition = mutationDefinitions.get(queued.name);
      const runtime = mutationRuntime.get(queued.name);
      updateMutationQueueSize(queued.name);
      notifyMutationQueueChanged();
      if (!definition || !runtime) {
        const error = new MutationError(`Queued mutation "${queued.name}" is no longer registered.`, {
          metadata: { mutation: queued.name, queuedAt: queued.queuedAt }
        });
        queued.reject(error);
        continue;
      }

      try {
        const result = await startMutation(queued.name, definition, runtime, queued.payload);
        queued.resolve(result);
        flushed += 1;
      } catch (error) {
        queued.reject(toError(error));
      }
    }

    if (flushed > 0) {
      dispatchEvent({
        type: "mutation.queue.flushed",
        count: flushed,
        timestamp: Date.now(),
        metadata: { mesh: name }
      });
      notifyMutationQueueChanged();
    }
  }

  function clearQueuedMutations(error?: Error): void {
    const queueError = error ?? new MutationError("Queued mutations were cleared.", {
      code: "STATEMESH_MUTATION_QUEUE_CLEARED",
      metadata: { mesh: name }
    });
    while (queuedMutations.length > 0) {
      const queued = queuedMutations.shift();
      queued?.reject(queueError);
      if (queued) updateMutationQueueSize(queued.name);
    }
    notifyMutationQueueChanged();
  }

  function queueOfflineMutation<TPayload, TResult>(mutationName: string, payload: TPayload): Promise<TResult> {
    const queuedAt = Date.now();
    return new Promise<TResult>((resolve, reject) => {
      queuedMutations.push({
        id: `${mutationName}_${queuedAt}_${++idCounter}`,
        name: mutationName,
        payload: cloneState(payload),
        queuedAt,
        resolve: resolve as (value: unknown) => void,
        reject
      });
      updateMutationQueueSize(mutationName);
      notifyMutationQueueChanged();
      dispatchEvent({
        type: "mutation.queued",
        name: mutationName,
        payload: summarizePayload(payload),
        timestamp: queuedAt,
        metadata: { mesh: name }
      });
    });
  }

  function restoreQueuedMutations(mutations: readonly QueuedMutation[], metadata?: Record<string, unknown>): void {
    const affectedNames = new Set<string>(queuedMutations.map((queued) => queued.name));
    queuedMutations.length = 0;
    for (const queued of mutations) {
      affectedNames.add(queued.name);
      queuedMutations.push({
        id: queued.id,
        name: queued.name,
        payload: cloneState(queued.payload),
        queuedAt: queued.queuedAt,
        resolve: () => undefined,
        reject: () => undefined
      });
    }
    for (const mutationName of affectedNames) updateMutationQueueSize(mutationName);
    notifyMutationQueueChanged();
    if (mutations.length > 0) {
      dispatchEvent({
        type: "mutation.queue.restored",
        count: mutations.length,
        timestamp: Date.now(),
        metadata: { mesh: name, ...metadata }
      });
    }
  }

  function persistQueuedMutations(persistOptions: MutationQueuePersistOptions = {}): Unsubscribe {
    const storageKey = persistOptions.key ?? `${name}:mutation-queue`;
    const serializer = persistOptions.serializer ?? JSON.stringify;
    const deserializer = persistOptions.deserializer ?? JSON.parse;
    const storage = resolveStorageAdapter(persistOptions.storage ?? "localStorage");
    const version = persistOptions.version ?? 1;
    const ttl = parseDurationOptional(persistOptions.ttl);

    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const envelope = deserializer(raw) as {
          version?: number;
          expiresAt?: number | null;
          queuedMutations?: QueuedMutation[];
        };
        if (!envelope.expiresAt || envelope.expiresAt > Date.now()) {
          restoreQueuedMutations(envelope.queuedMutations ?? [], persistOptions.metadata);
        } else {
          storage.removeItem(storageKey);
        }
      }
    } catch (error) {
      const wrapped = new MutationError("StateMesh mutation queue restore failed; persisted queue was ignored.", {
        cause: error,
        metadata: { key: storageKey }
      });
      persistOptions.onError?.(wrapped);
      dispatchEvent({ type: "mutation.queue.persist.failed", error: wrapped, timestamp: Date.now(), metadata: persistOptions.metadata });
    }

    const save = () => {
      try {
        const queued = getQueuedMutations();
        storage.setItem(storageKey, serializer({
          version,
          updatedAt: Date.now(),
          expiresAt: ttl ? Date.now() + ttl : null,
          queuedMutations: queued
        }));
        dispatchEvent({
          type: "mutation.queue.persisted",
          count: queued.length,
          timestamp: Date.now(),
          metadata: { key: storageKey, ...persistOptions.metadata }
        });
      } catch (error) {
        const wrapped = new MutationError("StateMesh mutation queue save failed.", {
          cause: error,
          metadata: { key: storageKey }
        });
        persistOptions.onError?.(wrapped);
        dispatchEvent({ type: "mutation.queue.persist.failed", error: wrapped, timestamp: Date.now(), metadata: persistOptions.metadata });
      }
    };

    const saveWithThrottle = persistOptions.throttle ? debounce(save, persistOptions.throttle) : save;
    mutationQueueListeners.add(saveWithThrottle);
    saveWithThrottle();

    return () => {
      if (hasCancel(saveWithThrottle)) saveWithThrottle.cancel();
      mutationQueueListeners.delete(saveWithThrottle);
    };
  }

  function notifyMutationQueueChanged(): void {
    for (const listener of mutationQueueListeners) listener();
    notifyDevtools();
  }

  function updateMutationQueueSize(mutationName: string): void {
    const queueSize = queuedMutations.filter((queued) => queued.name === mutationName).length;
    const current = mutationStatuses.get(mutationName) ?? DEFAULT_MUTATION_STATUS;
    setMutationStatus(mutationName, {
      queueSize,
      queued: queueSize > 0,
      status: queueSize > 0 && current.status === "idle"
        ? "queued"
        : queueSize === 0 && current.status === "queued"
          ? "idle"
          : current.status
    });
  }

  function shouldQueueMutation<TPayload, TResult>(
    definition: MutationDefinition<TState, TPayload, TResult>
  ): boolean {
    if (!isOffline()) return false;
    const offline = definition.offline;
    if (!offline) return false;
    if (offline === true) return true;
    return offline.queue ?? true;
  }

  function handleOnline(): void {
    const shouldFlush = [...mutationDefinitions.values()].some((definition) => {
      const offline = definition.offline;
      if (!offline) return false;
      if (offline === true) return true;
      return offline.flushOnReconnect ?? true;
    });
    if (shouldFlush) runQueuedMutations().catch(() => undefined);
  }

  function normalizeEntities<TEntity, TId extends string | number = string | number>(
    entities: readonly TEntity[],
    selectId: EntityIdSelector<TEntity, TId>
  ): EntityCollection<TEntity, TId> {
    return mergeEntities<TEntity, TId>({ byId: {}, allIds: [] }, entities, selectId);
  }

  function mergeEntities<TEntity, TId extends string | number = string | number>(
    collection: EntityCollection<TEntity, TId> | null | undefined,
    entities: readonly TEntity[],
    selectId: EntityIdSelector<TEntity, TId>
  ): EntityCollection<TEntity, TId> {
    const byId = { ...(collection?.byId ?? {}) };
    const allIds = [...(collection?.allIds ?? [])];
    const seen = new Set(allIds.map(String));

    for (const entity of entities) {
      const id = getEntityId(entity, selectId);
      byId[String(id)] = {
        ...(byId[String(id)] as Record<string, unknown> | undefined),
        ...(entity as Record<string, unknown>)
      } as TEntity;
      if (!seen.has(String(id))) {
        allIds.push(id);
        seen.add(String(id));
      }
    }

    return { byId, allIds };
  }

  function removeEntities<TEntity, TId extends string | number = string | number>(
    collection: EntityCollection<TEntity, TId>,
    ids: readonly TId[]
  ): EntityCollection<TEntity, TId> {
    const removeSet = new Set(ids.map(String));
    const byId = { ...collection.byId };
    for (const id of removeSet) delete byId[id];
    return {
      byId,
      allIds: collection.allIds.filter((id) => !removeSet.has(String(id)))
    };
  }

  function denormalizeEntities<TEntity, TId extends string | number = string | number>(
    collection: EntityCollection<TEntity, TId>
  ): TEntity[] {
    return collection.allIds
      .map((id) => collection.byId[String(id)])
      .filter((entity): entity is TEntity => entity !== undefined);
  }

  function createMutationContext<TPayload>(
    mutationName: string,
    payload: TPayload,
    signal: AbortSignal
  ): MutationContext<TState, TPayload> {
    return {
      name: mutationName,
      payload,
      signal,
      mesh,
      getResourceData: <TData = unknown, TParams = unknown>(
        resourceRef: string | ResourceHandle<TParams, TData>,
        params?: TParams
      ): TData | null => {
        const resourceName = typeof resourceRef === "string" ? resourceRef : resourceRef.resourceName;
        return getResourceStatus<TData, TParams>(resourceName, params).data;
      },
      setResourceData: <TData = unknown, TParams = unknown>(
        resourceRef: string | ResourceHandle<TParams, TData>,
        params: TParams | undefined,
        updater: TData | ((current: TData | null) => TData),
        setOptions?: ResourceSetDataOptions
      ) => {
        const resourceName = typeof resourceRef === "string" ? resourceRef : resourceRef.resourceName;
        setResourceData<TData, TParams>(resourceName, params, updater, setOptions);
      },
      invalidate: (resourceInvalidation) => invalidateResources(resourceInvalidation)
    };
  }

  function applyDraft(mutator: (draft: TState) => void, event: MeshEvent): void {
    batcher.batch(() => {
      const draft = cloneState(state);
      mutator(draft);
      commitState(draft, event);
    });
  }

  async function applyDraftAsync(mutator: (draft: TState) => MaybePromise<void>, event: MeshEvent): Promise<void> {
    const draft = cloneState(state);
    await mutator(draft);
    commitState(draft, event);
  }

  function persist(persistOptions: PersistOptions<TState>): Unsubscribe {
    const storageKey = persistOptions.key ?? `${name}:state`;
    const serializer = persistOptions.serializer ?? JSON.stringify;
    const deserializer = persistOptions.deserializer ?? JSON.parse;
    const storage = resolveStorageAdapter(persistOptions.storage ?? "localStorage");
    const version = persistOptions.version ?? 1;
    const ttl = parseTtl(persistOptions.ttl);
    const allowedKeys = persistOptions.keys.filter((key) => !(persistOptions.blacklist ?? []).includes(key));

    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const envelope = deserializer(raw) as {
          version?: number;
          expiresAt?: number | null;
          state?: Record<string, unknown>;
        };

        if (!envelope.expiresAt || envelope.expiresAt > Date.now()) {
          let persistedState = envelope.state ?? {};
          if (envelope.version !== undefined && envelope.version !== version && persistOptions.migrate) {
            persistedState = persistOptions.migrate(persistedState, envelope.version);
          }

          state = applyPersistedPaths(state, persistedState, allowedKeys);
          queueEvent({ type: "persist.restored", keys: allowedKeys, timestamp: Date.now(), metadata: persistOptions.metadata });
          batcher.schedule();
        } else {
          storage.removeItem(storageKey);
        }
      }
    } catch (error) {
      const wrapped = new PersistenceError("StateMesh persistence restore failed; persisted data was ignored.", {
        cause: error,
        metadata: { key: storageKey }
      });
      persistOptions.onError?.(wrapped);
      dispatchEvent({ type: "persist.failed", error: wrapped, timestamp: Date.now() });
    }

    const save = () => {
      try {
        const persisted = pickPaths(state, allowedKeys);
        const envelope = {
          version,
          updatedAt: Date.now(),
          expiresAt: ttl ? Date.now() + ttl : null,
          state: persisted
        };
        storage.setItem(storageKey, serializer(envelope));
      } catch (error) {
        const wrapped = new PersistenceError("StateMesh persistence save failed.", {
          cause: error,
          metadata: { key: storageKey }
        });
        persistOptions.onError?.(wrapped);
        dispatchEvent({ type: "persist.failed", error: wrapped, timestamp: Date.now() });
      }
    };

    const saveWithThrottle = persistOptions.throttle ? debounce(save, persistOptions.throttle) : save;
    const unsubscribe = subscribe(
      (currentState) => pickPaths(currentState, allowedKeys),
      () => saveWithThrottle(),
      { equality: pathRecordEqual }
    );
    saveWithThrottle();

    return () => {
      if (hasCancel(saveWithThrottle)) saveWithThrottle.cancel();
      unsubscribe();
    };
  }

  function applyPersistedPaths(currentState: TState, persistedState: Record<string, unknown>, allowedKeys: readonly string[]): TState {
    let next = currentState;
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(persistedState, key)) {
        next = setValueAtPath(next, key, persistedState[key]);
      }
    }
    return next;
  }

  function urlState<TValues extends Record<string, unknown>>(
    urlName: string,
    defaults: TValues,
    urlOptions: UrlStateOptions<TValues> = {}
  ): void {
    const replace = assertCanRegister(urlStates, "urlState", urlName, urlOptions.replace);
    const existing = urlStates.get(urlName);
    if (existing && replace) {
      existing.cleanup();
    }

    const values = readUrlValues(urlName, defaults, urlOptions);
    const listeners = existing?.listeners ?? new Set<() => void>();
    const write = urlOptions.debounce
      ? debounce((nextValues: TValues) => writeUrlValues(urlName, nextValues, urlOptions), urlOptions.debounce)
      : (nextValues: TValues) => writeUrlValues(urlName, nextValues, urlOptions);

    const onPopState = () => {
      const entry = urlStates.get(urlName) as UrlStateEntry<TValues> | undefined;
      if (!entry) return;
      entry.values = readUrlValues(urlName, entry.defaults, entry.options);
      for (const listener of entry.listeners) listener();
      dispatchEvent({ type: "url.changed", name: urlName, timestamp: Date.now() });
    };

    if (isBrowser()) {
      window.addEventListener("popstate", onPopState);
    }

    urlStates.set(urlName, {
      defaults,
      values,
      options: urlOptions,
      listeners,
      cleanup: () => {
        if (isBrowser()) window.removeEventListener("popstate", onPopState);
        if (hasCancel(write)) write.cancel();
      },
      write
    } as UrlStateEntry<Record<string, unknown>>);
    notifyDevtools();
  }

  function getUrlState<TValues extends Record<string, unknown>>(urlName: string): TValues {
    const entry = urlStates.get(urlName);
    if (!entry) {
      throw new UrlStateError(`URL state "${urlName}" is not registered.`, {
        metadata: { urlState: urlName }
      });
    }
    return entry.values as TValues;
  }

  function setUrlState<TValues extends Record<string, unknown>>(
    urlName: string,
    valueOrUpdater: Partial<TValues> | ((current: TValues) => Partial<TValues> | TValues)
  ): void {
    const entry = urlStates.get(urlName) as UrlStateEntry<TValues> | undefined;
    if (!entry) {
      throw new UrlStateError(`URL state "${urlName}" is not registered.`, {
        metadata: { urlState: urlName }
      });
    }

    const partial = typeof valueOrUpdater === "function" ? valueOrUpdater(entry.values) : valueOrUpdater;
    entry.values = { ...entry.values, ...partial };
    entry.write(entry.values);
    for (const listener of entry.listeners) listener();
    dispatchEvent({ type: "url.changed", name: urlName, timestamp: Date.now() });
  }

  function subscribeUrlState(urlName: string, listener: () => void): Unsubscribe {
    const entry = urlStates.get(urlName);
    if (!entry) {
      throw new UrlStateError(`URL state "${urlName}" is not registered.`, {
        metadata: { urlState: urlName }
      });
    }
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }

  function form<TValues extends Record<string, unknown>>(
    formName: string,
    definition: FormDefinition<TValues>,
    options: MeshRegistryOptions = {}
  ): void {
    const replace = assertCanRegister(formEntries, "form", formName, options.replace);
    const existing = formEntries.get(formName);
    if (existing && replace) {
      existing.autosave?.cancel();
    }
    const initialValues = cloneState(definition.initialValues);
    const entry: FormEntry<Record<string, unknown>> = {
      definition: definition as FormDefinition<Record<string, unknown>>,
      initialValues,
      state: createInitialFormState(initialValues, definition as FormDefinition<Record<string, unknown>>),
      listeners: existing?.listeners ?? new Set(),
      validationRun: null,
      fieldValidationRuns: new Map(),
      autosave: null
    };
    entry.autosave = createFormAutosave(formName, entry);
    formEntries.set(formName, entry);
    notifyDevtools();
    if (existing && replace) {
      notifyForm(formName);
    }
  }

  function getForm<TValues extends Record<string, unknown>>(formName: string): FormApi<TValues> {
    const entry = formEntries.get(formName) as FormEntry<TValues> | undefined;
    if (!entry) {
      throw new FormError(`Form "${formName}" is not registered.`, {
        metadata: { form: formName }
      });
    }

    const blurField = <K extends keyof TValues & string>(fieldName: K) => {
      entry.state = {
        ...entry.state,
        touched: { ...entry.state.touched, [fieldName]: true }
      };
      notifyForm(formName, fieldName);
      if (entry.definition.validateOnBlur ?? Boolean(entry.definition.fields?.[fieldName])) {
        validateFormField(entry, formName, fieldName).catch(() => undefined);
      }
    };

    const api = {
      ...entry.state,
      field: <K extends keyof TValues & string>(fieldName: K) => ({
        name: fieldName,
        value: entry.state.values[fieldName],
        onChange: (eventOrValue: unknown) => {
          const value = readFieldValue(eventOrValue);
          setFormValue(entry, formName, fieldName, value as TValues[K]);
        },
        onBlur: () => blurField(fieldName)
      }),
      checkbox: <K extends keyof TValues & string>(fieldName: K) => ({
        name: fieldName,
        checked: Boolean(entry.state.values[fieldName]),
        onChange: (eventOrValue: unknown) => {
          setFormValue(entry, formName, fieldName, readCheckboxValue(eventOrValue) as TValues[K]);
        },
        onBlur: () => blurField(fieldName)
      }),
      radio: <K extends keyof TValues & string>(fieldName: K, value: TValues[K]) => ({
        name: fieldName,
        value,
        checked: Object.is(entry.state.values[fieldName], value),
        onChange: () => {
          setFormValue(entry, formName, fieldName, value);
        },
        onBlur: () => blurField(fieldName)
      }),
      file: <K extends keyof TValues & string>(fieldName: K) => ({
        name: fieldName,
        onChange: (eventOrValue: unknown) => {
          setFormValue(entry, formName, fieldName, readFileValue(eventOrValue) as TValues[K]);
        },
        onBlur: () => blurField(fieldName)
      }),
      select: <K extends keyof TValues & string>(fieldName: K) => ({
        name: fieldName,
        value: entry.state.values[fieldName],
        onChange: (eventOrValue: unknown) => {
          const value = readFieldValue(eventOrValue);
          setFormValue(entry, formName, fieldName, value as TValues[K]);
        },
        onBlur: () => blurField(fieldName)
      }),
      setValue: <K extends keyof TValues & string>(fieldName: K, value: TValues[K]) => {
        setFormValue(entry, formName, fieldName, value);
      },
      fieldArray: <K extends keyof TValues & string>(fieldName: K) => createFormFieldArray(entry, formName, fieldName),
      setError: <K extends keyof TValues & string>(fieldName: K, error: string | null) => {
        entry.state = {
          ...entry.state,
          errors: updateError(entry.state.errors, fieldName, error)
        };
        notifyForm(formName, fieldName);
      },
      setServerErrors: (errors: FormErrors<TValues>) => setFormServerErrors(entry, formName, errors),
      reset: (values?: TValues) => resetForm(entry, formName, values),
      resetToServer: (values: TValues) => resetForm(entry, formName, values),
      validate: () => validateForm(entry, formName),
      validateField: <K extends keyof TValues & string>(fieldName: K) => validateFormField(entry, formName, fieldName),
      validateStep: () => validateFormStep(entry, formName),
      submit: async (event?: { preventDefault?: () => void }) => {
        event?.preventDefault?.();
        await submitForm(entry, formName, "submit");
      },
      autosaveNow: () => submitForm(entry, formName, "autosave"),
      nextStep: () => moveFormStep(entry, formName, entry.state.stepIndex + 1, true),
      previousStep: () => {
        const previous = Math.max(0, entry.state.stepIndex - 1);
        setFormStep(entry, formName, previous);
      },
      goToStep: (step: string | number) => moveFormStep(entry, formName, step, true)
    } satisfies FormApi<TValues>;

    return api;
  }

  function subscribeForm(formName: string, listener: () => void): Unsubscribe {
    const entry = formEntries.get(formName);
    if (!entry) {
      throw new FormError(`Form "${formName}" is not registered.`, {
        metadata: { form: formName }
      });
    }
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }

  function snapshot(label?: string): Snapshot<TState> {
    const id = `snapshot_${Date.now()}_${++idCounter}`;
    const snap: Snapshot<TState> = {
      id,
      label,
      state: cloneState(state),
      timestamp: Date.now()
    };
    snapshots.set(id, snap);
    return snap;
  }

  function restore(snapshotId: string): void {
    const snap = snapshots.get(snapshotId);
    if (!snap) {
      throw new StateMeshError(`Snapshot "${snapshotId}" does not exist.`, {
        code: "STATEMESH_SNAPSHOT_NOT_FOUND",
        metadata: { snapshotId }
      });
    }
    commitState(cloneState(snap.state), createStateEvent(undefined, { snapshotId }));
  }

  function batch<T>(fn: () => T): T {
    return batcher.batch(fn);
  }

  function middleware(handler: MeshMiddleware<TState>): Unsubscribe {
    middlewares.add(handler);
    return () => middlewares.delete(handler);
  }

  function guard(targetOrHandler: MeshGuardTarget | MeshGuard<TState>, maybeHandler?: MeshGuard<TState>): Unsubscribe {
    const entry: GuardEntry<TState> = typeof targetOrHandler === "function" && !maybeHandler
      ? { target: null, handler: targetOrHandler as MeshGuard<TState> }
      : { target: targetOrHandler as MeshGuardTarget, handler: maybeHandler as MeshGuard<TState> };

    if (!entry.handler) {
      throw new GuardError("StateMesh guard requires a handler.", {
        metadata: { mesh: name }
      });
    }

    guards.add(entry);
    return () => guards.delete(entry);
  }

  function use(plugin: MeshPlugin<TState>): Unsubscribe {
    const existing = pluginCleanups.get(plugin.name);
    if (existing) {
      if (!shouldAllowViteDevReregistration()) {
        throw new DuplicateRegistrationError(`Plugin "${plugin.name}" is already registered.`, {
          metadata: { plugin: plugin.name }
        });
      }
      existing.cleanup?.();
      pluginCleanups.delete(plugin.name);
    }

    const cleanup = plugin.setup({
      mesh,
      emit: dispatchEvent,
      onEvent
    });
    const entry: PluginEntry = { cleanup };
    pluginCleanups.set(plugin.name, entry);

    return () => {
      if (pluginCleanups.get(plugin.name) !== entry) return;
      entry.cleanup?.();
      pluginCleanups.delete(plugin.name);
    };
  }

  function onEvent(listener: (event: MeshEvent) => MaybePromise<void>): Unsubscribe {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  }

  function createStateEvent(path?: MeshPath, metadata?: Record<string, unknown>): MeshEvent {
    return {
      type: "state.changed",
      path: typeof path === "string" ? path : Array.isArray(path) ? path.join(".") : undefined,
      timestamp: Date.now(),
      metadata
    };
  }

  function notifyForm(formName: string, field?: string): void {
    const entry = formEntries.get(formName);
    if (!entry) return;
    for (const listener of entry.listeners) listener();
    notifyDevtools();
    dispatchEvent({ type: "form.changed", name: formName, field, timestamp: Date.now() });
  }

  function createInitialFormState<TValues extends Record<string, unknown>>(
    initialValues: TValues,
    definition: FormDefinition<TValues>
  ): FormState<TValues> {
    const steps = definition.steps ?? [];
    return {
      values: cloneState(initialValues),
      initialValues: cloneState(initialValues),
      errors: {},
      serverErrors: {},
      touched: {},
      dirtyFields: {},
      dirty: false,
      validating: false,
      validatingFields: {},
      submitting: false,
      autosaving: false,
      submitted: false,
      submitError: null,
      autosaveError: null,
      autosavedAt: null,
      currentStep: steps[0]?.name ?? null,
      stepIndex: steps.length > 0 ? 0 : -1,
      steps
    };
  }

  function createFormAutosave<TValues extends Record<string, unknown>>(
    formName: string,
    entry: FormEntry<TValues>
  ): FormEntry<TValues>["autosave"] {
    const autosaveOptions = normalizeFormAutosave(entry.definition.autosave);
    if (!autosaveOptions) return null;
    return debounce(() => {
      submitForm(entry, formName, "autosave").catch(() => undefined);
    }, autosaveOptions.debounce ?? 500);
  }

  function setFormValue<TValues extends Record<string, unknown>, K extends keyof TValues & string>(
    entry: FormEntry<TValues>,
    formName: string,
    fieldName: K,
    value: TValues[K]
  ): void {
    const dirtyFields = updateDirtyFields(entry, fieldName, value);
    const serverErrors = entry.definition.clearServerErrorOnChange === false
      ? entry.state.serverErrors
      : updateError(entry.state.serverErrors, fieldName, null);
    const errors = entry.definition.clearServerErrorOnChange === false
      ? entry.state.errors
      : updateError(entry.state.errors, fieldName, null);

    entry.state = {
      ...entry.state,
      values: { ...entry.state.values, [fieldName]: value },
      touched: { ...entry.state.touched, [fieldName]: true },
      dirtyFields,
      serverErrors,
      errors,
      dirty: formHasDirtyFields(dirtyFields),
      submitted: false
    };
    notifyForm(formName, fieldName);
    if (entry.definition.validateOnChange) {
      validateFormField(entry, formName, fieldName).catch(() => undefined);
    }
    scheduleFormAutosave(entry);
  }

  function createFormFieldArray<TValues extends Record<string, unknown>, K extends keyof TValues & string>(
    entry: FormEntry<TValues>,
    formName: string,
    fieldName: K
  ): FormFieldArrayApi<TValues, K> {
    type Item = TValues[K] extends Array<infer TItem> ? TItem : unknown;
    const items = Array.isArray(entry.state.values[fieldName])
      ? [...entry.state.values[fieldName] as Item[]]
      : [];

    const replace = (nextItems: Item[]) => {
      setFormValue(entry, formName, fieldName, nextItems as TValues[K]);
    };

    return {
      name: fieldName,
      items: items as TValues[K] extends Array<infer TItem> ? TItem[] : unknown[],
      append: (item) => replace([...items, item as Item]),
      insert: (index, item) => {
        const next = [...items];
        next.splice(clampIndex(index, next.length), 0, item as Item);
        replace(next);
      },
      update: (index, item) => {
        if (index < 0 || index >= items.length) return;
        const next = [...items];
        next[index] = item as Item;
        replace(next);
      },
      remove: (index) => {
        if (index < 0 || index >= items.length) return;
        const next = [...items];
        next.splice(index, 1);
        replace(next);
      },
      move: (from, to) => {
        if (from < 0 || from >= items.length) return;
        const next = [...items];
        const [item] = next.splice(from, 1);
        if (item === undefined) return;
        next.splice(clampIndex(to, next.length), 0, item);
        replace(next);
      },
      replace: (nextItems) => replace([...(nextItems as Item[])])
    };
  }

  async function validateForm<TValues extends Record<string, unknown>>(
    entry: FormEntry<TValues>,
    formName: string
  ): Promise<FormErrors<TValues>> {
    const runId = Symbol(formName);
    entry.validationRun = runId;
    const validationValues = cloneState(entry.state.values);
    try {
      entry.state = { ...entry.state, validating: true };
      notifyForm(formName);
      dispatchEvent({ type: "form.validation.started", name: formName, timestamp: Date.now() });
      const schemaErrors = (await entry.definition.schema?.validate(validationValues)) ?? {};
      const formErrors = (await entry.definition.validate?.(validationValues)) ?? {};
      const fieldErrors = await validateFormFields(
        entry,
        formName,
        Object.keys(validationValues) as Array<keyof TValues & string>,
        false,
        validationValues
      );
      if (entry.validationRun !== runId) return entry.state.errors;
      const errors = mergeFormErrors(schemaErrors, formErrors, fieldErrors, entry.state.serverErrors);
      entry.validationRun = null;
      entry.state = {
        ...entry.state,
        errors,
        validating: false,
        validatingFields: {}
      };
      notifyForm(formName);
      dispatchEvent({
        type: "form.validation.completed",
        name: formName,
        valid: Object.keys(errors).length === 0,
        timestamp: Date.now()
      });
      return errors;
    } catch (error) {
      if (entry.validationRun !== runId) return entry.state.errors;
      entry.validationRun = null;
      entry.state = {
        ...entry.state,
        validating: false,
        validatingFields: {}
      };
      notifyForm(formName);
      throw new FormError(`Validation for form "${formName}" failed.`, {
        cause: error,
        metadata: { form: formName }
      });
    }
  }

  async function validateFormField<TValues extends Record<string, unknown>, K extends keyof TValues & string>(
    entry: FormEntry<TValues>,
    formName: string,
    fieldName: K
  ): Promise<string | null> {
    const validator = entry.definition.fields?.[fieldName];
    if (!validator) return entry.state.errors[fieldName] ?? null;

    const runId = Symbol(fieldName);
    entry.fieldValidationRuns.set(fieldName, runId);
    const validationValues = cloneState(entry.state.values);
    entry.state = {
      ...entry.state,
      validating: true,
      validatingFields: { ...entry.state.validatingFields, [fieldName]: true }
    };
    notifyForm(formName, fieldName);
    dispatchEvent({ type: "form.validation.started", name: formName, field: fieldName, timestamp: Date.now() });

    try {
      const error = (await validator(validationValues[fieldName], validationValues, fieldName)) ?? null;
      if (entry.fieldValidationRuns.get(fieldName) !== runId) {
        return entry.state.errors[fieldName] ?? null;
      }
      const nextError = error ?? entry.state.serverErrors[fieldName] ?? null;
      const errors = updateError(entry.state.errors, fieldName, nextError);
      entry.fieldValidationRuns.delete(fieldName);
      const validatingFields = { ...entry.state.validatingFields };
      delete validatingFields[fieldName];
      entry.state = {
        ...entry.state,
        errors,
        validatingFields,
        validating: formHasValidatingFields(validatingFields)
      };
      notifyForm(formName, fieldName);
      dispatchEvent({
        type: "form.validation.completed",
        name: formName,
        field: fieldName,
        valid: !nextError,
        timestamp: Date.now()
      });
      return nextError;
    } catch (error) {
      if (entry.fieldValidationRuns.get(fieldName) !== runId) {
        return entry.state.errors[fieldName] ?? null;
      }
      entry.fieldValidationRuns.delete(fieldName);
      const validatingFields = { ...entry.state.validatingFields };
      delete validatingFields[fieldName];
      entry.state = {
        ...entry.state,
        validatingFields,
        validating: formHasValidatingFields(validatingFields)
      };
      notifyForm(formName, fieldName);
      throw new FormError(`Validation for field "${String(fieldName)}" in form "${formName}" failed.`, {
        cause: error,
        metadata: { form: formName, field: fieldName }
      });
    }
  }

  async function validateFormFields<TValues extends Record<string, unknown>>(
    entry: FormEntry<TValues>,
    formName: string,
    fields: Array<keyof TValues & string>,
    notify = true,
    values: TValues = entry.state.values
  ): Promise<FormErrors<TValues>> {
    const errors: FormErrors<TValues> = {};
    for (const field of fields) {
      const validator = entry.definition.fields?.[field];
      if (!validator) continue;
      const error = (await validator(values[field], values, field)) ?? null;
      if (error) errors[field] = error;
    }

    if (notify) {
      entry.state = {
        ...entry.state,
        errors: mergeFormErrors(entry.state.errors, errors, entry.state.serverErrors)
      };
      notifyForm(formName);
    }

    return errors;
  }

  async function validateFormStep<TValues extends Record<string, unknown>>(
    entry: FormEntry<TValues>,
    formName: string
  ): Promise<FormErrors<TValues>> {
    const step = entry.state.steps[entry.state.stepIndex];
    if (!step) return validateForm(entry, formName);

    entry.state = { ...entry.state, validating: true };
    notifyForm(formName);
    dispatchEvent({ type: "form.validation.started", name: formName, timestamp: Date.now(), metadata: { step: step.name } });

    try {
      const errors = mergeFormErrors(
        pickFormErrors((await entry.definition.schema?.validate(entry.state.values)) ?? {}, step.fields as Array<keyof TValues & string>),
        await validateFormFields(entry, formName, step.fields as Array<keyof TValues & string>, false),
        pickFormErrors(entry.state.serverErrors, step.fields as Array<keyof TValues & string>)
      );
      entry.state = {
        ...entry.state,
        errors: mergeFormErrors(omitFormErrors(entry.state.errors, step.fields as Array<keyof TValues & string>), errors),
        validating: false
      };
      notifyForm(formName);
      dispatchEvent({
        type: "form.validation.completed",
        name: formName,
        valid: Object.keys(errors).length === 0,
        timestamp: Date.now(),
        metadata: { step: step.name }
      });
      return errors;
    } catch (error) {
      entry.state = { ...entry.state, validating: false };
      notifyForm(formName);
      throw error;
    }
  }

  async function submitForm<TValues extends Record<string, unknown>>(
    entry: FormEntry<TValues>,
    formName: string,
    mode: "submit" | "autosave"
  ): Promise<void> {
    const autosaveOptions = normalizeFormAutosave(entry.definition.autosave);
    if (mode === "submit") entry.autosave?.cancel();
    if (mode === "autosave") {
      if (!autosaveOptions) return;
      if (autosaveOptions.when && !autosaveOptions.when(entry.state)) return;
      if (autosaveOptions.validate !== false) {
        const errors = await validateForm(entry, formName);
        if (Object.keys(errors).length > 0) return;
      }
    } else {
      const errors = await validateForm(entry, formName);
      if (Object.keys(errors).length > 0) return;
    }

    const startedAt = Date.now();
    entry.state = mode === "autosave"
      ? { ...entry.state, autosaving: true, autosaveError: null }
      : { ...entry.state, submitting: true, submitError: null };
    notifyForm(formName);
    dispatchEvent({ type: mode === "autosave" ? "form.autosave.started" : "form.submit.started", name: formName, timestamp: startedAt });

    try {
      await runFormSubmitter(mode === "autosave" ? autosaveOptions?.submit ?? entry.definition.submit : entry.definition.submit, entry.state.values);
      const finishedAt = Date.now();
      entry.state = mode === "autosave"
        ? { ...entry.state, autosaving: false, autosaveError: null, autosavedAt: finishedAt }
        : { ...entry.state, submitting: false, submitted: true, submitError: null };
      notifyForm(formName);
      dispatchEvent({
        type: mode === "autosave" ? "form.autosave.succeeded" : "form.submit.succeeded",
        name: formName,
        duration: finishedAt - startedAt,
        timestamp: finishedAt
      });
    } catch (error) {
      const formError = toError(error);
      const mappedErrors = entry.definition.mapServerErrors?.(formError) ?? {};
      const mergedErrors = mergeFormErrors(entry.state.errors, mappedErrors);
      entry.state = mode === "autosave"
        ? {
          ...entry.state,
          autosaving: false,
          autosaveError: formError,
          serverErrors: { ...entry.state.serverErrors, ...mappedErrors },
          errors: mergedErrors
        }
        : {
          ...entry.state,
          submitting: false,
          submitError: formError,
          serverErrors: { ...entry.state.serverErrors, ...mappedErrors },
          errors: mergedErrors
        };
      notifyForm(formName);
      dispatchEvent({
        type: mode === "autosave" ? "form.autosave.failed" : "form.submit.failed",
        name: formName,
        error: formError,
        timestamp: Date.now()
      });
      if (mode === "submit") throw formError;
    }
  }

  async function runFormSubmitter<TValues extends Record<string, unknown>>(
    submitter: FormDefinition<TValues>["submit"] | undefined,
    values: TValues
  ): Promise<void> {
    if (!submitter) return;
    if (typeof submitter === "string") {
      if (mutationDefinitions.has(submitter)) {
        await runMutation(submitter, values);
        return;
      }
      await runTransaction(submitter, values);
      return;
    }
    if (typeof submitter === "function") {
      await submitter(values);
      return;
    }
    if (submitter.kind === "statemesh.mutation") {
      await submitter.run(values);
      return;
    }
    await submitter.run(values);
  }

  function setFormServerErrors<TValues extends Record<string, unknown>>(
    entry: FormEntry<TValues>,
    formName: string,
    errors: FormErrors<TValues>
  ): void {
    const previousServerFields = Object.keys(entry.state.serverErrors) as Array<keyof TValues & string>;
    entry.state = {
      ...entry.state,
      serverErrors: { ...errors },
      errors: mergeFormErrors(omitFormErrors(entry.state.errors, previousServerFields), errors)
    };
    notifyForm(formName);
  }

  function resetForm<TValues extends Record<string, unknown>>(
    entry: FormEntry<TValues>,
    formName: string,
    values?: TValues
  ): void {
    entry.autosave?.cancel();
    entry.validationRun = null;
    entry.fieldValidationRuns.clear();
    const nextInitialValues = cloneState(values ?? entry.initialValues);
    entry.initialValues = nextInitialValues;
    entry.state = {
      ...createInitialFormState(nextInitialValues, entry.definition),
      autosavedAt: entry.state.autosavedAt
    };
    notifyForm(formName);
  }

  function scheduleFormAutosave<TValues extends Record<string, unknown>>(entry: FormEntry<TValues>): void {
    entry.autosave?.();
  }

  async function moveFormStep<TValues extends Record<string, unknown>>(
    entry: FormEntry<TValues>,
    formName: string,
    step: string | number,
    validateCurrent: boolean
  ): Promise<boolean> {
    if (validateCurrent) {
      const errors = await validateFormStep(entry, formName);
      if (Object.keys(errors).length > 0) return false;
    }
    return setFormStep(entry, formName, step);
  }

  function setFormStep<TValues extends Record<string, unknown>>(
    entry: FormEntry<TValues>,
    formName: string,
    step: string | number
  ): boolean {
    const stepIndex = typeof step === "number"
      ? step
      : entry.state.steps.findIndex((candidate) => candidate.name === step);
    if (stepIndex < 0 || stepIndex >= entry.state.steps.length) return false;
    entry.state = {
      ...entry.state,
      stepIndex,
      currentStep: entry.state.steps[stepIndex]?.name ?? null
    };
    notifyForm(formName);
    return true;
  }

  function normalizeFormAutosave<TValues extends Record<string, unknown>>(
    autosave: FormDefinition<TValues>["autosave"]
  ): FormAutosaveOptions<TValues> | null {
    if (!autosave) return null;
    if (autosave === true) return {};
    return autosave;
  }

  function updateDirtyFields<TValues extends Record<string, unknown>, K extends keyof TValues & string>(
    entry: FormEntry<TValues>,
    fieldName: K,
    value: TValues[K]
  ): FormDirtyFields<TValues> {
    const dirtyFields = { ...entry.state.dirtyFields };
    if (formValueEqual(value, entry.state.initialValues[fieldName])) {
      delete dirtyFields[fieldName];
    } else {
      dirtyFields[fieldName] = true;
    }
    return dirtyFields;
  }

  function formHasDirtyFields<TValues extends Record<string, unknown>>(dirtyFields: FormDirtyFields<TValues>): boolean {
    return Object.values(dirtyFields).some(Boolean);
  }

  function formHasValidatingFields<TValues extends Record<string, unknown>>(
    validatingFields: FormValidatingFields<TValues>
  ): boolean {
    return Object.values(validatingFields).some(Boolean);
  }

  function mergeFormErrors<TValues extends Record<string, unknown>>(
    ...errorMaps: Array<FormErrors<TValues> | null | undefined>
  ): FormErrors<TValues> {
    const merged: FormErrors<TValues> = {};
    for (const errors of errorMaps) {
      if (!errors) continue;
      for (const [field, error] of Object.entries(errors)) {
        if (error) {
          merged[field as keyof TValues & string] = error;
        } else {
          delete merged[field as keyof TValues & string];
        }
      }
    }
    return merged;
  }

  function pickFormErrors<TValues extends Record<string, unknown>>(
    errors: FormErrors<TValues>,
    fields: readonly (keyof TValues & string)[]
  ): FormErrors<TValues> {
    const picked: FormErrors<TValues> = {};
    for (const field of fields) {
      const error = errors[field];
      if (error) picked[field] = error;
    }
    return picked;
  }

  function omitFormErrors<TValues extends Record<string, unknown>>(
    errors: FormErrors<TValues>,
    fields: readonly (keyof TValues & string)[]
  ): FormErrors<TValues> {
    const fieldSet = new Set<string>(fields);
    const omitted: FormErrors<TValues> = {};
    for (const [field, error] of Object.entries(errors)) {
      if (!fieldSet.has(field) && error) {
        omitted[field as keyof TValues & string] = error;
      }
    }
    return omitted;
  }

  function formValueEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      return left.every((item, index) => formValueEqual(item, right[index]));
    }

    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key) && formValueEqual(leftRecord[key], rightRecord[key]));
  }

  function normalizeHandleInvalidation(resourceName: string, invalidation?: ResourceInvalidation): ResourceInvalidation {
    if (!invalidation) return { names: [resourceName] };
    if (isResourceTagArray(invalidation)) return { names: [resourceName], tags: invalidation };
    return {
      ...invalidation,
      names: invalidation.names ?? [resourceName]
    };
  }

  function resourceStatusMatchesFilter(status: ResourceStatus, filter: ResourceDehydrateOptions): boolean {
    if (filter.names?.length && !filter.names.includes(status.name)) return false;
    const tags = normalizeResourceTags(filter.tags);
    if (tags.length > 0 && !tags.some((tag) => status.tags.includes(tag))) return false;
    if (filter.predicate && !filter.predicate(status)) return false;
    return true;
  }

  function getResourceDefinition<TParams = void, TData = unknown>(
    resourceName: string
  ): ResourceDefinition<TState, TParams, TData, unknown> {
    const definition = resourceDefinitions.get(resourceName);
    if (!definition) {
      throw new ResourceError(`Resource "${resourceName}" is not registered.`, {
        metadata: { resource: resourceName }
      });
    }
    return definition as ResourceDefinition<TState, TParams, TData, unknown>;
  }

  function getResourceCacheKey<TParams, TData>(
    resourceName: string,
    definition: ResourceDefinition<TState, TParams, TData, unknown>,
    params: TParams | undefined
  ): string {
    const rawKey = definition.key ? definition.key(params as TParams) : params;
    return `${resourceName}:${stableResourceHash(rawKey)}`;
  }

  function ensureResourceEntry<TParams, TData>(
    resourceName: string,
    key: string,
    params: TParams | undefined,
    definition: ResourceDefinition<TState, TParams, TData, unknown>
  ): ResourceEntry {
    const existing = resourceEntries.get(key);
    if (existing) return existing;

    // Evict oldest unused entries when over the cache limit.
    const maxEntries = definition.maxCacheEntries ?? Infinity;
    if (resourceEntries.size >= maxEntries) {
      const evictable: Array<{ key: string; updatedAt: number }> = [];
      for (const [existingKey, existingEntry] of resourceEntries) {
        const listenerCount = resourceListeners.get(existingKey)?.size ?? 0;
        if (listenerCount === 0 && existingEntry.status === "success") {
          evictable.push({ key: existingKey, updatedAt: existingEntry.updatedAt ?? 0 });
        }
      }
      evictable.sort((a, b) => a.updatedAt - b.updatedAt);
      const toEvict = resourceEntries.size - maxEntries + 1;
      for (let i = 0; i < toEvict && i < evictable.length; i++) {
        const e = resourceEntries.get(evictable[i].key);
        if (e?.gcTimer) clearTimeout(e.gcTimer);
        resourceEntries.delete(evictable[i].key);
      }
    }

    const initialData = typeof definition.initialData === "function"
      ? (definition.initialData as (params: TParams) => TData)(params as TParams)
      : definition.initialData;
    const hasInitialData = initialData !== undefined;
    const now = hasInitialData ? Date.now() : null;
    const entry: ResourceEntry = {
      name: resourceName,
      key,
      params,
      status: hasInitialData ? "success" : "idle",
      pending: false,
      fetching: false,
      stale: !hasInitialData,
      data: initialData ?? null,
      error: null,
      tags: normalizeResourceTags(hasInitialData ? resolveResourceTags(definition, initialData as TData, params as TParams) : []),
      pages: hasInitialData ? [initialData] : [],
      pageParams: hasInitialData ? [undefined] : [],
      startedAt: null,
      finishedAt: now,
      duration: null,
      updatedAt: now,
      controller: null,
      inFlight: null,
      gcTimer: null
    };
    resourceEntries.set(key, entry);
    scheduleResourceGc(entry, definition);
    return entry;
  }

  function createResourceStatus<TData, TParams>(
    entry: ResourceEntry,
    definition: ResourceDefinition<TState, TParams, TData, unknown>
  ): ResourceStatus<TData, TParams> {
    const stale = isResourceEntryStale(entry, definition);
    const lastPage = entry.pages.length > 0 ? entry.pages[entry.pages.length - 1] as TData : entry.data as TData | null;
    const nextPageParam = lastPage !== null && lastPage !== undefined
      ? definition.getNextPageParam?.(lastPage, entry.pages as TData[], entry.params as TParams)
      : undefined;

    return {
      name: entry.name,
      key: entry.key,
      params: entry.params as TParams,
      status: entry.status,
      pending: entry.pending,
      fetching: entry.fetching,
      stale,
      data: (entry.data ?? null) as TData | null,
      error: entry.error,
      tags: [...entry.tags],
      pages: [...entry.pages] as TData[],
      pageParams: [...entry.pageParams],
      hasNextPage: nextPageParam !== null && nextPageParam !== undefined,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
      duration: entry.duration,
      updatedAt: entry.updatedAt
    };
  }

  function isResourceEntryStale<TParams, TData>(
    entry: ResourceEntry,
    definition: ResourceDefinition<TState, TParams, TData, unknown>
  ): boolean {
    if (entry.stale || entry.status !== "success" || !entry.updatedAt) return true;
    const staleTime = parseDuration(definition.staleTime ?? 0);
    if (staleTime === Number.POSITIVE_INFINITY) return false;
    return Date.now() - entry.updatedAt > staleTime;
  }

  function resolveResourceTags<TParams, TData>(
    definition: ResourceDefinition<TState, TParams, TData, unknown>,
    data: TData | null,
    params: TParams
  ): readonly ResourceTag[] {
    if (!definition.tags) return [];
    return typeof definition.tags === "function" ? definition.tags(data, params) : definition.tags;
  }

  function scheduleResourceGc<TParams, TData>(
    entry: ResourceEntry,
    definition: ResourceDefinition<TState, TParams, TData, unknown>
  ): void {
    if (entry.gcTimer) {
      clearTimeout(entry.gcTimer);
      entry.gcTimer = null;
    }
    if (definition.cacheTime === false) return;
    const cacheTime = parseDuration(definition.cacheTime ?? "5m");
    if (cacheTime === Number.POSITIVE_INFINITY) return;
    entry.gcTimer = setTimeout(() => {
      if ((resourceListeners.get(entry.key)?.size ?? 0) > 0 || entry.fetching) {
        scheduleResourceGc(entry, definition);
        return;
      }
      resourceEntries.delete(entry.key);
      resourceListeners.delete(entry.key);
    }, cacheTime);
  }

  function notifyResourceEntry(entry: ResourceEntry): void {
    for (const listener of resourceListeners.get(entry.key) ?? []) {
      listener();
    }
    for (const listener of resourceChangeListeners) {
      listener();
    }
    notifyDevtools();
  }

  function normalizeInvalidation(invalidation?: ResourceInvalidation): {
    names?: readonly string[];
    tags?: readonly ResourceTag[];
    predicate?: (status: ResourceStatus) => boolean;
    refetch?: boolean | "active";
    metadata?: Record<string, unknown>;
  } {
    if (!invalidation) return {};
    if (isResourceTagArray(invalidation)) return { tags: invalidation };
    return invalidation;
  }

  function resourceEntryMatchesInvalidation(
    entry: ResourceEntry,
    invalidation: {
      names?: readonly string[];
      tags?: readonly ResourceTag[];
      predicate?: (status: ResourceStatus) => boolean;
    }
  ): boolean {
    const names = invalidation.names;
    if (names?.length && !names.includes(entry.name)) return false;

    const tags = normalizeResourceTags(invalidation.tags);
    if (tags.length > 0 && !tags.some((tag) => entry.tags.includes(tag))) return false;

    if (invalidation.predicate) {
      const definition = resourceDefinitions.get(entry.name);
      if (!definition) return false;
      return invalidation.predicate(createResourceStatus(entry, definition));
    }

    return Boolean(names?.length || tags.length > 0 || !invalidation.predicate);
  }

  function cloneResourceEntries(): Map<string, ResourceEntry> {
    const snapshot = new Map<string, ResourceEntry>();
    for (const [key, entry] of resourceEntries) {
      snapshot.set(key, cloneResourceEntry(entry));
    }
    return snapshot;
  }

  function cloneResourceEntry(entry: ResourceEntry): ResourceEntry {
    return {
      ...entry,
      data: cloneState(entry.data),
      error: entry.error,
      tags: [...entry.tags],
      pages: cloneState(entry.pages),
      pageParams: cloneState(entry.pageParams),
      controller: null,
      inFlight: null,
      gcTimer: null
    };
  }

  function restoreResourceEntries(snapshot: Map<string, ResourceEntry>): void {
    const touchedKeys = new Set([...resourceEntries.keys(), ...snapshot.keys()]);
    for (const entry of resourceEntries.values()) {
      if (entry.gcTimer) clearTimeout(entry.gcTimer);
    }
    resourceEntries.clear();
    for (const [key, entry] of snapshot) {
      resourceEntries.set(key, cloneResourceEntry(entry));
    }
    for (const key of touchedKeys) {
      for (const listener of resourceListeners.get(key) ?? []) listener();
    }
  }
}

function maskDevtoolsValue(value: unknown, mask: readonly MeshPath[] | undefined, previewBytes: number): unknown {
  let next = sanitizeDevtoolsValue(value);
  for (const path of mask ?? []) {
    next = setValueAtPath(next, path, "[StateMesh masked]");
  }
  return createDevtoolsPreview(next, previewBytes);
}

function createDevtoolsPreview(value: unknown, previewBytes: number): unknown {
  const safe = sanitizeDevtoolsValue(value);
  const serialized = stringifyDevtoolsValue(safe);
  if (serialized.length <= previewBytes) return safe;
  return {
    type: "large-value",
    bytes: serialized.length,
    preview: serialized.slice(0, previewBytes)
  };
}

function sanitizeDevtoolsValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof File !== "undefined" && value instanceof File) {
    return {
      type: "File",
      name: value.name,
      size: value.size,
      mime: value.type,
      lastModified: value.lastModified
    };
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return {
      type: "Blob",
      size: value.size,
      mime: value.type
    };
  }

  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDevtoolsValue(item, seen));
  }

  if (value instanceof Map) {
    return {
      type: "Map",
      entries: [...value.entries()].map(([key, item]) => [sanitizeDevtoolsValue(key, seen), sanitizeDevtoolsValue(item, seen)])
    };
  }

  if (value instanceof Set) {
    return {
      type: "Set",
      values: [...value.values()].map((item) => sanitizeDevtoolsValue(item, seen))
    };
  }

  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().reduce<Record<string, unknown>>((output, key) => {
    output[key] = sanitizeDevtoolsValue(record[key], seen);
    return output;
  }, {});
}

function stringifyDevtoolsValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized === undefined ? "undefined" : serialized;
  } catch {
    return String(value);
  }
}

function countDevtoolsStateKeys(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  return Array.isArray(value) ? value.length : Object.keys(value).length;
}

function updateError<TValues extends Record<string, unknown>, K extends keyof TValues & string>(
  errors: FormErrors<TValues>,
  fieldName: K,
  error: string | null
): FormErrors<TValues> {
  const next = { ...errors };
  if (error) next[fieldName] = error;
  else delete next[fieldName];
  return next;
}

function readFieldValue(eventOrValue: unknown): unknown {
  if (
    eventOrValue &&
    typeof eventOrValue === "object" &&
    "target" in eventOrValue &&
    eventOrValue.target &&
    typeof eventOrValue.target === "object" &&
    "value" in eventOrValue.target
  ) {
    return (eventOrValue.target as { value: unknown }).value;
  }

  return eventOrValue;
}

function readCheckboxValue(eventOrValue: unknown): boolean {
  if (
    eventOrValue &&
    typeof eventOrValue === "object" &&
    "target" in eventOrValue &&
    eventOrValue.target &&
    typeof eventOrValue.target === "object" &&
    "checked" in eventOrValue.target
  ) {
    return Boolean((eventOrValue.target as { checked: unknown }).checked);
  }

  return Boolean(eventOrValue);
}

function readFileValue(eventOrValue: unknown): unknown {
  if (
    eventOrValue &&
    typeof eventOrValue === "object" &&
    "target" in eventOrValue &&
    eventOrValue.target &&
    typeof eventOrValue.target === "object" &&
    "files" in eventOrValue.target
  ) {
    const files = (eventOrValue.target as { files?: FileList | null }).files;
    if (!files) return null;
    return files.length === 1 ? files[0] : Array.from(files);
  }

  return eventOrValue;
}

function readUrlValues<TValues extends Record<string, unknown>>(
  name: string,
  defaults: TValues,
  options: UrlStateOptions<TValues>
): TValues {
  if (!isBrowser()) return cloneState(defaults);

  try {
    const params = new URLSearchParams(window.location.search);
    const values = { ...defaults };

    for (const key of Object.keys(defaults) as Array<keyof TValues & string>) {
      const paramName = getUrlParamName(name, key, options);
      const raw = params.get(paramName);
      if (raw === null) continue;
      values[key] = parseUrlValue(raw, defaults[key], options.serializers?.[key]);
    }

    const unknownField = getUnknownUrlField(defaults, options);
    if (unknownField) {
      const knownNames = new Set((Object.keys(defaults) as Array<keyof TValues & string>)
        .filter((key) => key !== unknownField)
        .map((key) => getUrlParamName(name, key, options)));
      const captured: Record<string, string> = {};
      params.forEach((value, paramName) => {
        if (!knownNames.has(paramName) && shouldCaptureUnknownUrlParam(paramName, options.captureUnknown)) {
          captured[paramName] = value;
        }
      });
      values[unknownField] = {
        ...(typeof defaults[unknownField] === "object" && defaults[unknownField] !== null ? defaults[unknownField] : {}),
        ...captured
      } as TValues[typeof unknownField];
    }

    return values;
  } catch (error) {
    throw new UrlStateError(`Failed to read URL state "${name}".`, {
      cause: error,
      metadata: { urlState: name }
    });
  }
}

function writeUrlValues<TValues extends Record<string, unknown>>(
  name: string,
  values: TValues,
  options: UrlStateOptions<TValues>
): void {
  if (!isBrowser()) return;

  try {
    const url = new URL(window.location.href);

    for (const key of Object.keys(values) as Array<keyof TValues & string>) {
      if (key === getUnknownUrlField(values, options)) continue;
      const paramName = getUrlParamName(name, key, options);
      const serialized = serializeUrlValue(values[key], options.serializers?.[key]);
      if (serialized === null || serialized === undefined || serialized === "") {
        url.searchParams.delete(paramName);
      } else {
        url.searchParams.set(paramName, serialized);
      }
    }

    const unknownField = getUnknownUrlField(values, options);
    if (unknownField) {
      const unknownValues = values[unknownField];
      const unknownRecord = unknownValues && typeof unknownValues === "object" && !Array.isArray(unknownValues)
        ? unknownValues as Record<string, unknown>
        : {};
      const knownNames = new Set((Object.keys(values) as Array<keyof TValues & string>)
        .filter((key) => key !== unknownField)
        .map((key) => getUrlParamName(name, key, options)));
      Array.from(url.searchParams.keys()).forEach((paramName) => {
        if (!knownNames.has(paramName) && shouldCaptureUnknownUrlParam(paramName, options.captureUnknown)) {
          url.searchParams.delete(paramName);
        }
      });
      for (const [paramName, value] of Object.entries(unknownRecord)) {
        const serialized = serializeUrlValue(value);
        if (serialized !== null && serialized !== undefined && serialized !== "") {
          url.searchParams.set(paramName, serialized);
        }
      }
    }

    const mode = options.mode ?? "replace";
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
  } catch (error) {
    throw new UrlStateError(`Failed to write URL state "${name}".`, {
      cause: error,
      metadata: { urlState: name }
    });
  }
}

function getUrlParamName<TValues extends Record<string, unknown>>(
  name: string,
  key: keyof TValues & string,
  options: UrlStateOptions<TValues>
): string {
  if (typeof options.paramNames === "function") return options.paramNames(key, name);
  const mappedName = options.paramNames?.[key];
  if (mappedName !== undefined) return mappedName;
  if (options.paramPrefix === false) return key;
  return options.paramPrefix ? `${options.paramPrefix}.${key}` : key;
}

function getUnknownUrlField<TValues extends Record<string, unknown>>(
  values: TValues,
  options: UrlStateOptions<TValues>
): keyof TValues & string | null {
  if (!options.captureUnknown) return null;
  if (options.unknownField) return options.unknownField;
  return Object.prototype.hasOwnProperty.call(values, "params") ? "params" as keyof TValues & string : null;
}

function shouldCaptureUnknownUrlParam(capturedName: string, capture: UrlStateOptions["captureUnknown"]): boolean {
  if (!capture) return false;
  if (capture === true) return true;
  if (capture instanceof RegExp) return capture.test(capturedName);
  return capture(capturedName);
}

function parseUrlValue<TValue>(raw: string, defaultValue: TValue, serializer?: UrlSerializer<TValue>): TValue {
  if (serializer) return serializer.parse(raw);
  if (Array.isArray(defaultValue)) return raw.split(",").filter(Boolean) as TValue;
  if (typeof defaultValue === "number") return Number(raw) as TValue;
  if (typeof defaultValue === "boolean") return (raw === "true") as TValue;
  return raw as TValue;
}

function serializeUrlValue<TValue>(value: TValue, serializer?: UrlSerializer<TValue>): string | null {
  if (serializer) return serializer.serialize(value);
  if (Array.isArray(value)) return value.join(",");
  if (value === null || value === undefined) return null;
  return String(value);
}

function parseTtl(ttl: PersistOptions["ttl"]): number | null {
  if (!ttl) return null;
  if (typeof ttl === "number") return ttl;
  const match = ttl.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new PersistenceError(`Invalid persistence TTL "${ttl}".`, {
      metadata: { ttl }
    });
  }

  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  } as const;
  const value = Number(match[1] ?? 0);
  const unit = match[2] as keyof typeof multipliers;
  return value * multipliers[unit];
}

function parseDuration(duration: number | `${number}${"ms" | "s" | "m" | "h" | "d"}`): number {
  if (typeof duration === "number") return duration;
  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new ResourceError(`Invalid resource duration "${duration}".`, {
      metadata: { duration }
    });
  }

  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  } as const;
  const value = Number(match[1] ?? 0);
  const unit = match[2] as keyof typeof multipliers;
  return value * multipliers[unit];
}

function parseDurationOptional(duration: ResourcePersistOptions["ttl"]): number | null {
  return duration === undefined ? null : parseDuration(duration);
}

function isOffline(): boolean {
  return isBrowser() && "navigator" in window && window.navigator.onLine === false;
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

function getEntityId<TEntity, TId extends string | number>(
  entity: TEntity,
  selectId: EntityIdSelector<TEntity, TId>
): TId {
  if (typeof selectId === "function") return selectId(entity);
  const value = (entity as Record<string, unknown>)[selectId];
  if (typeof value !== "string" && typeof value !== "number") {
    throw new StateMeshError(`Entity id "${selectId}" must be a string or number.`, {
      code: "STATEMESH_ENTITY_ID_INVALID",
      metadata: { selectId }
    });
  }
  return value as TId;
}

function normalizeResourceTags(tags?: readonly ResourceTag[]): string[] {
  return [...new Set((tags ?? []).map((tag) => {
    if (typeof tag === "string") return tag;
    return tag.id === undefined ? tag.type : `${tag.type}:${tag.id}`;
  }))];
}

function isResourceTagArray(value: ResourceInvalidation): value is readonly ResourceTag[] {
  return Array.isArray(value);
}

function stableResourceHash(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(sortResourceKey(value));
}

function sortResourceKey(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortResourceKey);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((sorted, key) => {
      sorted[key] = sortResourceKey(record[key]);
      return sorted;
    }, {});
}

function hasCancel(value: unknown): value is { cancel: () => void } {
  return typeof value === "function" && typeof (value as { cancel?: unknown }).cancel === "function";
}

function catchAsyncError(result: unknown): void {
  if (
    result &&
    typeof result === "object" &&
    "then" in result &&
    typeof (result as { then?: unknown }).then === "function" &&
    "catch" in result &&
    typeof (result as { catch?: unknown }).catch === "function"
  ) {
    (result as Promise<unknown>).catch(() => {
      // Middleware and plugin listeners are observational and must not crash the app.
    });
  }
}

function assertCanRegister(
  registry: { has: (name: string) => boolean },
  kind: string,
  registrationName: string,
  replace = false
): boolean {
  const exists = registry.has(registrationName);
  const shouldReplace = replace || (exists && shouldAllowViteDevReregistration());

  if (exists && !shouldReplace) {
    throw new DuplicateRegistrationError(`${kind} "${registrationName}" is already registered.`, {
      metadata: { kind, name: registrationName }
    });
  }

  return shouldReplace;
}

function guardTargetMatches<TState, TPayload>(
  target: MeshGuardTarget | null,
  context: MeshGuardContext<TState, TPayload>
): boolean {
  if (!target) return true;
  if (typeof target === "string") return target === context.name;
  if (target instanceof RegExp) return target.test(context.name);

  const kindMatches = !target.kind || target.kind === context.kind;
  const nameMatches = !target.name ||
    (typeof target.name === "string" ? target.name === context.name : target.name.test(context.name));
  return kindMatches && nameMatches;
}

function shouldAllowViteDevReregistration(): boolean {
  if (typeof document === "undefined") return false;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return false;

  return Boolean(document.querySelector("script[src*='@vite/client']"));
}

function attachActionRef<TPayload, TResult>(
  action: (payload: TPayload) => TResult,
  actionName: string
): MeshAction<TPayload, TResult> {
  Object.defineProperties(action, {
    actionName: {
      value: actionName,
      enumerable: true
    },
    kind: {
      value: "statemesh.action",
      enumerable: true
    }
  });

  return action as MeshAction<TPayload, TResult>;
}

function pathRecordEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is(a[key], b[key])) return false;
  }

  return true;
}

function pathsIntersect(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

function delay(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(delayOption: number | ((attempt: number, error: Error) => number) | undefined, attempt: number, error: Error): number {
  if (typeof delayOption === "function") return delayOption(attempt, error);
  return delayOption ?? 0;
}

function toError(error: unknown): Error & { code?: string } {
  if (error instanceof Error) return error as Error & { code?: string };
  return new Error(String(error)) as Error & { code?: string };
}

function getProfilerErrorCode(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return typeof code === "string" ? code : error.name;
  }
  return typeof error === "string" ? error : "UnknownError";
}

function estimateSerializedSize(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return 0;
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(serialized).length;
    return serialized.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function summarizePayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return { type: "array", length: payload.length };

  const record = payload as Record<string, unknown>;
  return {
    type: "object",
    keys: Object.keys(record).slice(0, 10)
  };
}
