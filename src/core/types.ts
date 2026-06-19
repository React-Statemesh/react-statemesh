import type { EqualityFn } from "../utils/equality";

/** A cleanup function returned by subscriptions, plugins, middleware, and persistence. */
export type Unsubscribe = () => void;

/** A dot path such as `"cart.items"` or an array path such as `["cart", "items"]`. */
export type MeshPath = string | readonly (string | number)[];

/** Allows APIs to return either a value or a promise for that value. */
export type MaybePromise<T> = T | Promise<T>;

/** Options for `mesh.setState`. */
export type MeshSetStateOptions = {
  /** Optional path to update instead of replacing or merging at the root. */
  path?: MeshPath;
  /** Extra metadata emitted with the `state.changed` event. */
  metadata?: Record<string, unknown>;
  /** Replace the whole state instead of shallow-merging object updates. */
  replace?: boolean;
  /** Update state without queueing a `state.changed` event. */
  silent?: boolean;
};

/**
 * Input accepted by `mesh.setState`.
 *
 * Handlers can return a partial state, a complete state, or mutate the draft and return nothing.
 */
export type MeshSetStateInput<TState> =
  | Partial<TState>
  | TState
  | ((state: TState) => TState | Partial<TState> | void);

/** Options shared by registry-style APIs such as `action`, `transaction`, `computed`, and `form`. */
export type MeshRegistryOptions = {
  /** Allow replacing an existing registration with the same name. Defaults to false. */
  replace?: boolean;
};

/** Structured event emitted by StateMesh for middleware, plugins, logging, and tests. */
export type MeshEvent =
  | { type: "state.changed"; path?: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "state.reset"; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "action.started"; name: string; payload?: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "action.completed"; name: string; duration: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "action.failed"; name: string; error: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "transaction.started"; name: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "transaction.optimistic"; name: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "transaction.effect.started"; name: string; attempt: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "transaction.committed"; name: string; duration: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "transaction.rollback"; name: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "transaction.cancelled"; name: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "transaction.failed"; name: string; error: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "persist.restored"; keys: string[]; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "persist.failed"; error: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "sync.received"; sourceTabId: string; keys: string[]; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "form.changed"; name: string; field?: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "form.validation.started"; name: string; field?: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "form.validation.completed"; name: string; field?: string; valid: boolean; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "form.submit.started"; name: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "form.submit.succeeded"; name: string; duration: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "form.submit.failed"; name: string; error: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "form.autosave.started"; name: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "form.autosave.succeeded"; name: string; duration: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "form.autosave.failed"; name: string; error: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "url.changed"; name: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "resource.fetch.started"; name: string; key: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "resource.fetch.succeeded"; name: string; key: string; duration: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "resource.fetch.failed"; name: string; key: string; error: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "resource.invalidated"; name?: string; key?: string; tags: string[]; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "resource.hydrated"; count: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "resource.persisted"; count: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "resource.persist.failed"; error: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "mutation.started"; name: string; payload?: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "mutation.queued"; name: string; payload?: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "mutation.queue.restored"; count: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "mutation.queue.persisted"; count: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "mutation.queue.persist.failed"; error: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "mutation.queue.flushed"; count: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "mutation.optimistic"; name: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "mutation.succeeded"; name: string; duration: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "mutation.rollback"; name: string; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "mutation.failed"; name: string; error: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "mesh.hydrated"; timestamp: number; metadata?: Record<string, unknown> };

/** A profiler sample recorded from a named StateMesh operation. */
export type MeshProfilerSample = {
  /** Unique sample id. */
  id: string;
  /** Operation category. */
  kind: "action" | "transaction" | "resource" | "mutation" | "form" | "computed";
  /** Registered operation name. */
  name: string;
  /** Final status for the sample. */
  status: "success" | "error" | "cancelled";
  /** Duration in milliseconds. */
  duration: number;
  /** Start timestamp in milliseconds. */
  startedAt: number;
  /** Finish timestamp in milliseconds. */
  finishedAt: number;
  /** True when the sample crossed the configured slow threshold. */
  slow: boolean;
  /** Extra diagnostic metadata. */
  metadata?: Record<string, unknown>;
};

/** Filter for reading profiler samples. */
export type MeshProfilerFilter = {
  /** Include only these operation kinds. */
  kinds?: readonly MeshProfilerSample["kind"][];
  /** Include only samples at or above this duration. */
  minDuration?: number;
  /** Include only slow samples. */
  slowOnly?: boolean;
  /** Include only samples whose name or kind contains this query. */
  query?: string;
  /** Maximum samples returned. Defaults to all retained samples. */
  limit?: number;
};

/** Runtime profiler configuration. */
export type MeshProfilerOptions = {
  /** Number of samples retained in memory. Defaults to 200. */
  limit?: number;
  /** Samples at or above this duration are marked slow. Defaults to 16ms. */
  slowThreshold?: number;
};

/** Diagnostic issue returned by `mesh.doctor()`. */
export type MeshDoctorIssue = {
  /** Issue severity. */
  level: "info" | "warning" | "error";
  /** Stable machine-readable code. */
  code: string;
  /** Human-readable explanation. */
  message: string;
  /** Area that produced the issue. */
  category: "state" | "resource" | "mutation" | "form" | "profiler" | "mesh";
  /** Related registration name when available. */
  name?: string;
  /** Safe diagnostic metadata. */
  metadata?: Record<string, unknown>;
};

/** Options for StateMesh Doctor diagnostics. */
export type MeshDoctorOptions = {
  /** Warn when serialized app state is larger than this many bytes. Defaults to 250kb. */
  stateSizeWarningBytes?: number;
  /** Warn/error when queued mutations are older than this duration. Defaults to 5m. */
  queuedMutationAgeWarning?: MeshDuration;
  /** Warn when a successful resource has been stale longer than this duration. Defaults to 5m. */
  staleResourceWarning?: MeshDuration;
  /** Warn when profiler samples cross this duration. Defaults to the profiler slow threshold. */
  slowOperationWarningMs?: number;
  /** Include informational health notes. Defaults to false. */
  includeInfo?: boolean;
};

/** Full diagnostic report returned by `mesh.doctor()`. */
export type MeshDoctorReport = {
  /** Mesh name. */
  mesh: string;
  /** Report timestamp. */
  generatedAt: number;
  /** Diagnostic issues. */
  issues: MeshDoctorIssue[];
  /** Summary counts by severity. */
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
};

/** Runtime operation kinds that can be guarded before execution. */
export type MeshGuardKind = "action" | "transaction" | "mutation";

/** A guard target can match by name, RegExp, or operation kind/name pair. */
export type MeshGuardTarget = string | RegExp | {
  /** Limit the guard to one operation kind. Omit to match all operation kinds. */
  kind?: MeshGuardKind;
  /** Match an operation name exactly or with a RegExp. Omit to match all names. */
  name?: string | RegExp;
};

/** Context passed to a guard before an action, transaction, or mutation runs. */
export type MeshGuardContext<TState = unknown, TPayload = unknown> = {
  /** Operation kind. */
  kind: MeshGuardKind;
  /** Registered operation name. */
  name: string;
  /** Payload passed to the operation. */
  payload: TPayload;
  /** Current state at guard time. */
  state: TState;
  /** Current mesh instance. */
  mesh: Mesh<TState>;
};

/** A guard can return false or `{ allow: false }` to block an operation. */
export type MeshGuardResult =
  | void
  | boolean
  | {
      /** Whether the operation should run. */
      allow: boolean;
      /** Optional human-readable block reason. */
      reason?: string;
      /** Optional error to throw instead of a generated guard error. */
      error?: Error;
      /** Extra metadata for the generated guard error. */
      metadata?: Record<string, unknown>;
    };

/** Guard function used by `mesh.guard`. */
export type MeshGuard<TState = unknown, TPayload = unknown> = (
  context: MeshGuardContext<TState, TPayload>
) => MeshGuardResult;

/**
 * Middleware observes action, transaction, persistence, sync, form, URL, and state events.
 *
 * @example
 * ```ts
 * mesh.middleware((event) => {
 *   analytics.track(event.type);
 * });
 * ```
 */
export type MeshMiddleware<TState = unknown> = (event: MeshEvent, mesh: Mesh<TState>) => MaybePromise<void>;

/** Context passed to a plugin during setup. */
export type MeshPluginContext<TState> = {
  /** The mesh instance the plugin is attached to. */
  mesh: Mesh<TState>;
  /** Emit an event to logger/devtools/event listeners. */
  emit: (event: MeshEvent) => void;
  /** Subscribe to all mesh events. */
  onEvent: (listener: (event: MeshEvent) => MaybePromise<void>) => Unsubscribe;
};

/**
 * A plugin that can attach behavior to a mesh instance.
 *
 * Plugins are registered once with `mesh.use(plugin)` and may return a cleanup function.
 */
export type MeshPlugin<TState = unknown> = {
  /** Unique plugin name. Duplicate names are rejected. */
  name: string;
  /** Setup function called when `mesh.use(plugin)` runs. */
  setup: (context: MeshPluginContext<TState>) => void | Unsubscribe;
};

/** Typed reference returned by `mesh.action`. Pass it to `useMeshAction` for inferred payload/result types. */
export type MeshActionRef<TPayload = void, TResult = void, TName extends string = string> = {
  /** Registered action name. */
  readonly actionName: TName;
  /** Internal marker for typed StateMesh references. */
  readonly kind: "statemesh.action";
  /** Phantom payload type for editor inference. */
  readonly __payload?: TPayload;
  /** Phantom result type for editor inference. */
  readonly __result?: TResult;
};

/** Context passed to an action handler. */
export type MeshActionContext<TState> = {
  /** Registered action name, for example `"cart.addItem"`. */
  name: string;
  /** Current mesh instance. */
  mesh: Mesh<TState>;
  /** Optional metadata reserved for future middleware integrations. */
  metadata?: Record<string, unknown>;
};

/**
 * Handler used by `mesh.action`.
 *
 * The `state` argument is a draft copy. You can mutate it directly.
 *
 * @example
 * ```ts
 * mesh.action("cart.addItem", (state, product) => {
 *   state.cart.items.push({ ...product, quantity: 1 });
 * });
 * ```
 */
export type MeshActionHandler<TState, TPayload = void, TResult = void> = (
  state: TState,
  payload: TPayload,
  context: MeshActionContext<TState>
) => TResult;

/** Callable action returned by `mesh.action`. Also acts as a typed reference for `useMeshAction`. */
export type MeshAction<TPayload = void, TResult = void, TName extends string = string> =
  ((payload: TPayload) => TResult) & MeshActionRef<TPayload, TResult, TName>;

/** Definition for a cached computed value. */
export type ComputedDefinition<TState, TValue> = {
  /** State paths that invalidate the cached value when changed. */
  deps?: readonly string[];
  /** Derives the computed value from current state. */
  compute: (state: TState) => TValue;
  /** Optional equality function used before notifying computed subscribers. */
  equality?: EqualityFn<TValue>;
};

/** Transaction lifecycle status. */
export type TransactionStatusValue = "idle" | "pending" | "success" | "error" | "rollback" | "cancelled";

/** Policy for handling multiple runs of the same transaction. */
export type TransactionConcurrencyPolicy = "takeLatest" | "block" | "queue";

/** Registration options for `mesh.transaction`. */
export type TransactionRegistrationOptions = MeshRegistryOptions & {
  /**
   * How to handle a new run while the transaction is already pending.
   *
   * - `takeLatest`: cancel and roll back the previous optimistic run, then start the latest run.
   * - `block`: reject the new run while one is pending.
   * - `queue`: run calls one after another.
   *
   * Defaults to `takeLatest`.
   */
  concurrency?: TransactionConcurrencyPolicy;
};

/** Current status metadata for a transaction. */
export type TransactionStatus<TResult = unknown> = {
  /** Current lifecycle state. */
  status: TransactionStatusValue;
  /** True while the effect phase is running. */
  pending: boolean;
  /** True after a successful commit. */
  success: boolean;
  /** Last error, if the transaction failed. */
  error: Error | null;
  /** Last successful result. */
  data: TResult | null;
  /** Start timestamp in milliseconds. */
  startedAt: number | null;
  /** Finish timestamp in milliseconds. */
  finishedAt: number | null;
  /** Duration in milliseconds. */
  duration: number | null;
  /** Number of effect attempts used by the last run. */
  attempts: number;
};

/**
 * Transaction handle returned by `mesh.transaction` and `useMeshTransaction`.
 *
 * @example
 * ```tsx
 * const checkout = useMeshTransaction("cart.checkout");
 * checkout.run({ paymentMethodId: "card_1" });
 * checkout.cancel();
 * ```
 */
export type TransactionHandle<TPayload = void, TResult = unknown> = TransactionStatus<TResult> & {
  /** Registered transaction name. */
  readonly transactionName: string;
  /** Internal marker for typed StateMesh references. */
  readonly kind: "statemesh.transaction";
  /** Run the transaction with a payload. */
  run: (payload: TPayload) => Promise<TResult>;
  /** Retry the transaction with the previous payload. */
  retry: () => Promise<TResult>;
  /** Abort the current run and mark it cancelled. */
  cancel: () => void;
  /** Reset status back to idle. */
  reset: () => void;
};

/** Retry configuration for the transaction effect phase. */
export type TransactionRetryOptions = {
  /** Number of retries after the first attempt. */
  attempts: number;
  /** Delay in milliseconds or a function returning the delay for each retry. */
  delay?: number | ((attempt: number, error: Error) => number);
};

/** Context passed to transaction lifecycle callbacks. */
export type TransactionContext<TState, TPayload = unknown> = {
  /** Registered transaction name. */
  name: string;
  /** Payload passed to `run`. */
  payload: TPayload;
  /** Abort signal controlled by timeout and cancellation. */
  signal: AbortSignal;
  /** Current effect attempt number, starting at 1. */
  attempt: number;
  /** Current mesh instance. */
  mesh: Mesh<TState>;
};

/**
 * Defines a transaction lifecycle: validation, snapshot, optimistic update, async effect, commit, rollback, error handling, retry, timeout, and cancellation.
 *
 * @example
 * ```ts
 * mesh.transaction("profile.update", {
 *   optimistic(state, values) {
 *     if (state.user) state.user.name = values.name;
 *   },
 *   async effect(_state, values, ctx) {
 *     return api.updateProfile(values, { signal: ctx.signal });
 *   },
 *   commit(state, user) {
 *     state.user = user;
 *   },
 *   rollback: true
 * });
 * ```
 */
export type TransactionDefinition<TState, TPayload = void, TResult = unknown> = {
  /** Validate before optimistic updates and effect execution. Throw to stop the transaction. */
  before?: (state: TState, payload: TPayload, context: TransactionContext<TState, TPayload>) => MaybePromise<void>;
  /** Mutate state immediately before the async effect. Rolled back on failure when `rollback` is enabled. */
  optimistic?: (state: TState, payload: TPayload, context: TransactionContext<TState, TPayload>) => void;
  /** Async side effect. Receives an AbortSignal for cancellation and timeout support. */
  effect?: (state: TState, payload: TPayload, context: TransactionContext<TState, TPayload>) => MaybePromise<TResult>;
  /** Mutate state after the effect resolves. */
  commit?: (state: TState, result: TResult, payload: TPayload, context: TransactionContext<TState, TPayload>) => void;
  /** Use `true` to restore the snapshot, or provide custom rollback logic. */
  rollback?:
    | boolean
    | ((state: TState, error: Error, payload: TPayload, context: TransactionContext<TState, TPayload>) => void);
  /** Mutate state after failure, typically to set error UI. */
  onError?: (state: TState, error: Error, payload: TPayload, context: TransactionContext<TState, TPayload>) => void;
  /** Retry only the effect phase. Optimistic updates are not duplicated. */
  retry?: TransactionRetryOptions;
  /** Abort the effect after this many milliseconds. */
  timeout?: number;
};

/** A point-in-time state copy created by `mesh.snapshot`. */
export type Snapshot<TState> = {
  /** Snapshot ID used by `mesh.restore(id)`. */
  id: string;
  /** Optional human-readable label. */
  label?: string;
  /** Cloned state captured at snapshot time. */
  state: TState;
  /** Capture timestamp in milliseconds. */
  timestamp: number;
};

/** Built-in persistence storage targets. */
export type PersistStorageName = "localStorage" | "sessionStorage" | "memory" | "indexedDB";

/** Synchronous storage adapter used by persistence. */
export type StorageAdapter = {
  /** Read a serialized value. */
  getItem: (key: string) => string | null;
  /** Write a serialized value. */
  setItem: (key: string, value: string) => void;
  /** Remove a serialized value. */
  removeItem: (key: string) => void;
};

/**
 * Persistence configuration.
 *
 * Persistence is whitelist-first. StateMesh never persists the whole state by default.
 *
 * @example
 * ```ts
 * mesh.persist({
 *   storage: "localStorage",
 *   keys: ["theme", "cart.items"],
 *   version: 1,
 *   ttl: "7d"
 * });
 * ```
 */
export type PersistOptions<TState = unknown> = {
  /** Storage key. Defaults to `${mesh.name}:state`. */
  key?: string;
  /** Built-in storage name or a custom adapter. */
  storage?: PersistStorageName | StorageAdapter;
  /** Whitelisted state paths to persist. */
  keys: readonly string[];
  /** Paths to exclude from the whitelist. */
  blacklist?: readonly string[];
  /** Persisted schema version. */
  version?: number;
  /** Expire persisted data after a duration such as `"7d"` or `60000`. */
  ttl?: number | `${number}${"ms" | "s" | "m" | "h" | "d"}`;
  /** Migrate persisted path values when versions change. */
  migrate?: (persisted: Record<string, unknown>, fromVersion: number) => Record<string, unknown>;
  /** Serialize the persistence envelope. Defaults to `JSON.stringify`. */
  serializer?: (value: unknown) => string;
  /** Deserialize the persistence envelope. Defaults to `JSON.parse`. */
  deserializer?: (value: string) => unknown;
  /** Throttle writes in milliseconds. */
  throttle?: number;
  /** Called when persistence restore/save fails. */
  onError?: (error: Error) => void;
  /** Metadata emitted with persistence events. */
  metadata?: Record<string, unknown>;
  /** Reserved for typed plugin integrations. */
  state?: TState;
};

/** Custom parser/serializer for one URL query value. */
export type UrlSerializer<TValue = unknown> = {
  /** Parse a query string value into application state. */
  parse: (value: string | null) => TValue;
  /** Serialize an application value into a query string value. Return null to remove it. */
  serialize: (value: TValue) => string | null;
};

/** Per-field URL query parameter names, or a resolver for fully custom naming. */
export type UrlParamNames<TValues extends Record<string, unknown> = Record<string, unknown>> =
  | Partial<Record<keyof TValues & string, string>>
  | ((field: keyof TValues & string, urlStateName: string) => string);

/** Dynamic query params can be captured into one object field. */
export type UrlUnknownParamCapture = boolean | RegExp | ((paramName: string) => boolean);

/** Configuration for `mesh.urlState`. */
export type UrlStateOptions<TValues extends Record<string, unknown> = Record<string, unknown>> = {
  /** Allow replacing an existing URL state registration with the same name. */
  replace?: boolean;
  /** Use `replaceState` or `pushState` when writing query params. Defaults to `replace`. */
  mode?: "push" | "replace";
  /** Debounce query writes in milliseconds. */
  debounce?: number;
  /** Prefix query params, or use `false` to use field names directly. */
  paramPrefix?: string | false;
  /** Custom query parameter names. Takes priority over `paramPrefix`. */
  paramNames?: UrlParamNames<TValues>;
  /** Capture unknown query params into an object field. */
  captureUnknown?: UrlUnknownParamCapture;
  /** Field that stores captured unknown params. Defaults to `"params"` when present. */
  unknownField?: keyof TValues & string;
  /** Per-field URL serializers. */
  serializers?: Partial<{ [K in keyof TValues]: UrlSerializer<TValues[K]> }>;
};

/** Form error map keyed by field name. */
export type FormErrors<TValues extends Record<string, unknown>> = Partial<Record<keyof TValues & string, string>>;

/** Form touched map keyed by field name. */
export type FormTouched<TValues extends Record<string, unknown>> = Partial<Record<keyof TValues & string, boolean>>;

/** Form dirty field map keyed by field name. */
export type FormDirtyFields<TValues extends Record<string, unknown>> = Partial<Record<keyof TValues & string, boolean>>;

/** Form validating field map keyed by field name. */
export type FormValidatingFields<TValues extends Record<string, unknown>> = Partial<Record<keyof TValues & string, boolean>>;

/** Field-level validator used by production forms. */
export type FormFieldValidator<TValues extends Record<string, unknown>, K extends keyof TValues & string = keyof TValues & string> = (
  value: TValues[K],
  values: TValues,
  field: K
) => MaybePromise<string | null | undefined>;

/** Map of field-level validators. Validators can be sync or async. */
export type FormFieldValidators<TValues extends Record<string, unknown>> = Partial<{
  [K in keyof TValues & string]: FormFieldValidator<TValues, K>;
}>;

/** Schema-like validator adapter result accepted by StateMesh forms. */
export type FormSchemaAdapter<TValues extends Record<string, unknown>> = {
  /** Parse or validate values and return field errors. */
  validate: (values: TValues) => MaybePromise<FormErrors<TValues>>;
};

/** One step in a multi-step form. */
export type FormStep<TValues extends Record<string, unknown>> = {
  /** Stable step name. */
  name: string;
  /** Optional display label for app UIs. */
  label?: string;
  /** Fields that belong to this step. */
  fields: readonly (keyof TValues & string)[];
};

/** Autosave configuration for a form. */
export type FormAutosaveOptions<TValues extends Record<string, unknown>> = {
  /** Debounce autosave by this many milliseconds. Defaults to 500. */
  debounce?: number;
  /** Validate before autosave. Defaults to true. */
  validate?: boolean;
  /** Custom autosave submitter. Defaults to the form `submit` target. */
  submit?: FormSubmitter<TValues>;
  /** Decide if this state should autosave. */
  when?: (state: FormState<TValues>) => boolean;
};

/** Supported form submit target. */
export type FormSubmitter<TValues extends Record<string, unknown>> =
  | string
  | TransactionHandle<TValues, unknown>
  | MutationHandle<TValues, unknown>
  | ((values: TValues) => MaybePromise<unknown>);

/** Current form state. */
export type FormState<TValues extends Record<string, unknown> = Record<string, unknown>> = {
  /** Current form values. */
  values: TValues;
  /** Server or initial values used as the dirty baseline. */
  initialValues: TValues;
  /** Field errors. */
  errors: FormErrors<TValues>;
  /** Server-side field errors, kept separately so they can be cleared on change. */
  serverErrors: FormErrors<TValues>;
  /** Field touched flags. */
  touched: FormTouched<TValues>;
  /** Field dirty flags compared to `initialValues`. */
  dirtyFields: FormDirtyFields<TValues>;
  /** True after any value changes from the initial values. */
  dirty: boolean;
  /** True while any validation is running. */
  validating: boolean;
  /** Per-field validation state. */
  validatingFields: FormValidatingFields<TValues>;
  /** True while submit is running. */
  submitting: boolean;
  /** True while autosave is running. */
  autosaving: boolean;
  /** True after a successful submit. */
  submitted: boolean;
  /** Last submit error. */
  submitError: Error | null;
  /** Last autosave error. */
  autosaveError: Error | null;
  /** Last successful autosave timestamp. */
  autosavedAt: number | null;
  /** Current step name for multi-step forms. */
  currentStep: string | null;
  /** Current step index for multi-step forms. */
  stepIndex: number;
  /** Registered form steps. */
  steps: readonly FormStep<TValues>[];
};

/** Definition used by `mesh.form`. */
export type FormDefinition<TValues extends Record<string, unknown> = Record<string, unknown>> = {
  /** Initial values for the form. */
  initialValues: TValues;
  /** Optional client-side validator. Return an object of field errors. */
  validate?: (values: TValues) => MaybePromise<FormErrors<TValues>>;
  /** Optional schema adapter, for libraries such as Zod, Yup, Valibot, or custom validators. */
  schema?: FormSchemaAdapter<TValues>;
  /** Field-level validators. Each validator can be sync or async. */
  fields?: FormFieldValidators<TValues>;
  /** Validate a field when it changes. Defaults to false. */
  validateOnChange?: boolean;
  /** Validate a field when it blurs. Defaults to true when `fields` exists. */
  validateOnBlur?: boolean;
  /** Clear server-side field errors when the user changes that field. Defaults to true. */
  clearServerErrorOnChange?: boolean;
  /** Transaction name, mutation name, transaction handle, mutation handle, or custom submit function. */
  submit?: FormSubmitter<TValues>;
  /** Map server/transaction errors to field errors. */
  mapServerErrors?: (error: Error) => FormErrors<TValues>;
  /** Autosave values after changes. */
  autosave?: boolean | FormAutosaveOptions<TValues>;
  /** Optional steps for multi-step forms. */
  steps?: readonly FormStep<TValues>[];
};

/** Props returned by `form.field(name)` for spreading onto inputs. */
export type FormFieldProps<TValue = unknown> = {
  /** Field name. */
  name: string;
  /** Current field value. */
  value: TValue;
  /** Accepts either a browser change event or a raw value. */
  onChange: (eventOrValue: unknown) => void;
  /** Marks the field as touched. */
  onBlur: () => void;
};

/** Props returned by `form.checkbox(name)` for checkbox inputs and toggles. */
export type FormCheckboxProps = {
  /** Field name. */
  name: string;
  /** Current checked state. */
  checked: boolean;
  /** Accepts a browser change event or a raw boolean. */
  onChange: (eventOrValue: unknown) => void;
  /** Marks the field as touched. */
  onBlur: () => void;
};

/** Props returned by `form.radio(name, value)` for radio inputs. */
export type FormRadioProps<TValue = unknown> = {
  /** Field name. */
  name: string;
  /** Radio option value. */
  value: TValue;
  /** True when the form value matches this radio option. */
  checked: boolean;
  /** Selects this radio value. */
  onChange: () => void;
  /** Marks the field as touched. */
  onBlur: () => void;
};

/** Props returned by `form.file(name)` for file inputs. */
export type FormFileProps = {
  /** Field name. */
  name: string;
  /** Accepts a browser file change event or a `File`, `FileList`, or `File[]`. */
  onChange: (eventOrValue: unknown) => void;
  /** Marks the field as touched. */
  onBlur: () => void;
};

/** Props returned by `form.select(name)` for select inputs. */
export type FormSelectProps<TValue = unknown> = FormFieldProps<TValue>;

/** Runtime form API returned by `mesh.getForm` and `useMeshForm`. */
export type FormApi<TValues extends Record<string, unknown> = Record<string, unknown>> = FormState<TValues> & {
  /** Return input props for one field. */
  field: <K extends keyof TValues & string>(name: K) => FormFieldProps<TValues[K]>;
  /** Return checkbox props for a boolean field. */
  checkbox: <K extends keyof TValues & string>(name: K) => FormCheckboxProps;
  /** Return radio props for one option of a field. */
  radio: <K extends keyof TValues & string>(name: K, value: TValues[K]) => FormRadioProps<TValues[K]>;
  /** Return file input props for a file field. */
  file: <K extends keyof TValues & string>(name: K) => FormFileProps;
  /** Return select props for one field. */
  select: <K extends keyof TValues & string>(name: K) => FormSelectProps<TValues[K]>;
  /** Set one field value and mark the form dirty. */
  setValue: <K extends keyof TValues & string>(name: K, value: TValues[K]) => void;
  /** Return helpers for an array field. */
  fieldArray: <K extends keyof TValues & string>(name: K) => FormFieldArrayApi<TValues, K>;
  /** Set or clear one field error. */
  setError: <K extends keyof TValues & string>(name: K, error: string | null) => void;
  /** Set or replace server errors. */
  setServerErrors: (errors: FormErrors<TValues>) => void;
  /** Reset values, errors, touched state, and submit metadata. Optionally replace the dirty baseline. */
  reset: (values?: TValues) => void;
  /** Reset to server data and use it as the new dirty baseline. */
  resetToServer: (values: TValues) => void;
  /** Run validation and update `errors`. */
  validate: () => Promise<FormErrors<TValues>>;
  /** Validate one field and update its error. */
  validateField: <K extends keyof TValues & string>(name: K) => Promise<string | null>;
  /** Validate the current step. */
  validateStep: () => Promise<FormErrors<TValues>>;
  /** Submit through the configured transaction or submit function. */
  submit: (event?: { preventDefault?: () => void }) => Promise<void>;
  /** Trigger autosave immediately when autosave is configured. */
  autosaveNow: () => Promise<void>;
  /** Move to the next step after validating the current step. */
  nextStep: () => Promise<boolean>;
  /** Move to the previous step. */
  previousStep: () => void;
  /** Move to a step by name or index. */
  goToStep: (step: string | number) => Promise<boolean>;
};

/** Helpers for dynamic array fields such as invoice items or multiple addresses. */
export type FormFieldArrayApi<
  TValues extends Record<string, unknown>,
  K extends keyof TValues & string
> = {
  /** Field name. */
  name: K;
  /** Current array items. */
  items: TValues[K] extends Array<infer TItem> ? TItem[] : unknown[];
  /** Append one item. */
  append: (item: TValues[K] extends Array<infer TItem> ? TItem : unknown) => void;
  /** Insert one item at an index. */
  insert: (index: number, item: TValues[K] extends Array<infer TItem> ? TItem : unknown) => void;
  /** Update one item at an index. */
  update: (index: number, item: TValues[K] extends Array<infer TItem> ? TItem : unknown) => void;
  /** Remove one item by index. */
  remove: (index: number) => void;
  /** Move one item from one index to another. */
  move: (from: number, to: number) => void;
  /** Replace the whole array. */
  replace: (items: TValues[K] extends Array<infer TItem> ? TItem[] : unknown[]) => void;
};

/** Duration accepted by resource/cache APIs. */
export type MeshDuration = number | `${number}${"ms" | "s" | "m" | "h" | "d"}`;

/** A cache tag used for resource invalidation. */
export type ResourceTag = string | { type: string; id?: string | number };

/** A stable resource key, similar to query keys in server-state libraries. */
export type ResourceKey = string | readonly unknown[] | Record<string, unknown>;

/** Resource lifecycle status. */
export type ResourceStatusValue = "idle" | "loading" | "success" | "error";

/** Context passed to resource fetchers. */
export type ResourceFetchContext<TState, TParams = void, TPageParam = unknown> = {
  /** Registered resource name. */
  name: string;
  /** Stable cache key for this resource/params pair. */
  key: string;
  /** Params passed to `fetchResource` or `useMeshResource`. */
  params: TParams;
  /** Abort signal for the current fetch. */
  signal: AbortSignal;
  /** Current mesh instance. */
  mesh: Mesh<TState>;
  /** Page param for pagination/infinite resources. */
  pageParam?: TPageParam;
  /** Zero-based page index for paginated fetches. */
  pageIndex: number;
  /** Extra metadata emitted with resource events. */
  metadata?: Record<string, unknown>;
};

/** Defines cached API/server data owned by the mesh. */
export type ResourceDefinition<TState, TParams = void, TData = unknown, TPageParam = unknown> = {
  /** Return a stable cache key from params. Defaults to the params value. */
  key?: (params: TParams) => ResourceKey;
  /** Fetch resource data. Requests for the same key are deduped by default. */
  fetch: (params: TParams, context: ResourceFetchContext<TState, TParams, TPageParam>) => MaybePromise<TData>;
  /** Tags attached to successful data for later invalidation. */
  tags?: readonly ResourceTag[] | ((data: TData | null, params: TParams) => readonly ResourceTag[]);
  /** How long successful data stays fresh. Defaults to 0ms. */
  staleTime?: MeshDuration;
  /** How long cached data is retained after writes. Use `false` to keep forever. Defaults to 5m. */
  cacheTime?: MeshDuration | false;
  /** Reuse an in-flight request for the same key. Defaults to true. */
  dedupe?: boolean;
  /** Keep previous data visible while refetching. Defaults to true. */
  keepPreviousData?: boolean;
  /** Optional initial data for the first read. */
  initialData?: TData | ((params: TParams) => TData);
  /** Return the next page param for pagination/infinite resources. */
  getNextPageParam?: (lastPage: TData, pages: TData[], params: TParams) => TPageParam | null | undefined;
  /** Merge fetched pages into the public `data` value. Defaults to the latest page. */
  mergePages?: (pages: TData[], params: TParams) => TData;
};

/** Runtime status for one resource cache entry. */
export type ResourceStatus<TData = unknown, TParams = unknown> = {
  /** Registered resource name. */
  name: string;
  /** Stable cache key. */
  key: string;
  /** Params for this cache entry. */
  params: TParams;
  /** Current lifecycle state. */
  status: ResourceStatusValue;
  /** True when the first load is pending. */
  pending: boolean;
  /** True whenever a fetch is in flight, including background refetches. */
  fetching: boolean;
  /** True when the entry should be refetched before use. */
  stale: boolean;
  /** Last successful data. */
  data: TData | null;
  /** Last error, if the fetch failed. */
  error: Error | null;
  /** Normalized invalidation tags. */
  tags: string[];
  /** Fetched pages for pagination/infinite resources. */
  pages: TData[];
  /** Page params used for pagination/infinite resources. */
  pageParams: unknown[];
  /** True when `fetchNextPage` can request another page. */
  hasNextPage: boolean;
  /** Start timestamp for the current/last fetch. */
  startedAt: number | null;
  /** Finish timestamp for the last fetch. */
  finishedAt: number | null;
  /** Duration in milliseconds for the last fetch. */
  duration: number | null;
  /** Timestamp of the last successful data write. */
  updatedAt: number | null;
};

/** Options for fetching a resource. */
export type ResourceFetchOptions = {
  /** Ignore fresh cached data and fetch again. */
  force?: boolean;
  /** Keep current status data while refetching. */
  background?: boolean;
  /** Page param for pagination/infinite resources. */
  pageParam?: unknown;
  /** Append the fetched page to existing pages. */
  append?: boolean;
  /** Extra metadata emitted with resource events. */
  metadata?: Record<string, unknown>;
};

/** Options for subscribing to a resource entry. */
export type ResourceSubscribeOptions = {
  /** Params for the resource entry. */
  params?: unknown;
};

/** Invalidation filter for resources. */
export type ResourceInvalidation =
  | readonly ResourceTag[]
  | {
      /** Resource names to invalidate. */
      names?: readonly string[];
      /** Tags to invalidate. */
      tags?: readonly ResourceTag[];
      /** Custom cache entry predicate. */
      predicate?: (status: ResourceStatus) => boolean;
      /** Refetch invalidated resources. `active` only refetches entries with subscribers. */
      refetch?: boolean | "active";
      /** Extra metadata emitted with invalidation events. */
      metadata?: Record<string, unknown>;
    };

/** Options for writing cached resource data manually. */
export type ResourceSetDataOptions = {
  /** Attach or replace invalidation tags. */
  tags?: readonly ResourceTag[];
  /** Mark the entry stale after writing. Defaults to false. */
  stale?: boolean;
  /** Extra metadata emitted with resource events. */
  metadata?: Record<string, unknown>;
};

/** Serializable resource cache entry used for SSR hydration and cache persistence. */
export type ResourceSnapshotEntry = {
  /** Registered resource name. */
  name: string;
  /** Stable cache key. */
  key: string;
  /** Params used to create the cache key. */
  params: unknown;
  /** Last successful data. */
  data: unknown;
  /** Normalized tags attached to this entry. */
  tags: string[];
  /** Pagination pages. */
  pages: unknown[];
  /** Pagination page params. */
  pageParams: unknown[];
  /** Whether the entry should refetch before use. */
  stale: boolean;
  /** Last data write timestamp. */
  updatedAt: number | null;
  /** Last fetch finish timestamp. */
  finishedAt: number | null;
};

/** Serializable resource cache snapshot. */
export type ResourceSnapshot = {
  /** Snapshot schema version. */
  version: number;
  /** Snapshot creation time. */
  createdAt: number;
  /** Dehydrated resource cache entries. */
  entries: ResourceSnapshotEntry[];
};

/** Options for resource cache dehydration. */
export type ResourceDehydrateOptions = {
  /** Include only these resource names. */
  names?: readonly string[];
  /** Include entries with matching tags. */
  tags?: readonly ResourceTag[];
  /** Custom filter. */
  predicate?: (status: ResourceStatus) => boolean;
};

/** Options for hydrating resource cache snapshots. */
export type ResourceHydrateOptions = {
  /** Mark hydrated entries stale so the UI can show data and refetch. Defaults to false. */
  stale?: boolean;
  /** Skip entries whose resources have not been registered. Defaults to true. */
  skipMissing?: boolean;
  /** Extra metadata emitted with hydration events. */
  metadata?: Record<string, unknown>;
};

/** Persistence options for the resource cache. */
export type ResourcePersistOptions = ResourceDehydrateOptions & {
  /** Storage key. Defaults to `${mesh.name}:resources`. */
  key?: string;
  /** Built-in storage name or a custom adapter. */
  storage?: PersistStorageName | StorageAdapter;
  /** Persisted schema version. */
  version?: number;
  /** Expire persisted resource cache after a duration. */
  ttl?: MeshDuration;
  /** Migrate a persisted resource snapshot when versions change. */
  migrate?: (snapshot: ResourceSnapshot, fromVersion: number) => ResourceSnapshot;
  /** Serialize the persistence envelope. Defaults to `JSON.stringify`. */
  serializer?: (value: unknown) => string;
  /** Deserialize the persistence envelope. Defaults to `JSON.parse`. */
  deserializer?: (value: string) => unknown;
  /** Throttle writes in milliseconds. */
  throttle?: number;
  /** Called when restore/save fails. */
  onError?: (error: Error) => void;
  /** Extra metadata emitted with persistence events. */
  metadata?: Record<string, unknown>;
};

/** Serializable full mesh snapshot for SSR, tests, app restore, or migrations. */
export type MeshDehydratedSnapshot = {
  /** Snapshot schema version. */
  version: number;
  /** Mesh name at snapshot time. */
  name: string;
  /** Snapshot creation timestamp. */
  createdAt: number;
  /** Cloned app state. */
  state?: unknown;
  /** Dehydrated resource cache. */
  resources?: ResourceSnapshot;
  /** Registered URL state values by name. */
  urlStates?: Record<string, unknown>;
  /** Registered form values by name. */
  forms?: Record<string, unknown>;
  /** Offline queued mutations. */
  queuedMutations?: QueuedMutation[];
};

/** Options for `mesh.dehydrate`. */
export type MeshDehydrateOptions = ResourceDehydrateOptions & {
  /** Include app state. Defaults to true. */
  state?: boolean;
  /** Include resource cache. Defaults to true. */
  resources?: boolean;
  /** Include URL state values. Defaults to true. */
  urlStates?: boolean;
  /** Include form values. Defaults to false. */
  forms?: boolean;
  /** Include queued offline mutations. Defaults to true. */
  queuedMutations?: boolean;
};

/** Options for `mesh.hydrate`. */
export type MeshHydrateOptions = ResourceHydrateOptions & {
  /** Hydrate app state. Defaults to true. */
  state?: boolean;
  /** Shallow-merge state instead of replacing it. Defaults to false. */
  mergeState?: boolean;
  /** Hydrate resource cache. Defaults to true. */
  resources?: boolean;
  /** Hydrate registered URL states. Defaults to true. */
  urlStates?: boolean;
  /** Hydrate registered forms. Defaults to false. */
  forms?: boolean;
  /** Hydrate queued offline mutations. Defaults to true. */
  queuedMutations?: boolean;
  /** Extra metadata emitted with hydration events. */
  metadata?: Record<string, unknown>;
};

/** Persistence options for the offline mutation queue. */
export type MutationQueuePersistOptions = {
  /** Storage key. Defaults to `${mesh.name}:mutation-queue`. */
  key?: string;
  /** Built-in storage name or a custom adapter. */
  storage?: PersistStorageName | StorageAdapter;
  /** Persisted schema version. */
  version?: number;
  /** Expire persisted queue after a duration. */
  ttl?: MeshDuration;
  /** Serialize the persistence envelope. Defaults to `JSON.stringify`. */
  serializer?: (value: unknown) => string;
  /** Deserialize the persistence envelope. Defaults to `JSON.parse`. */
  deserializer?: (value: string) => unknown;
  /** Throttle writes in milliseconds. */
  throttle?: number;
  /** Called when restore/save fails. */
  onError?: (error: Error) => void;
  /** Extra metadata emitted with queue persistence events. */
  metadata?: Record<string, unknown>;
};

/** Normalized entity collection used by `mesh.normalizeEntities`. */
export type EntityCollection<TEntity, TId extends string | number = string | number> = {
  /** Entity records by id. */
  byId: Record<string, TEntity>;
  /** Stable id order. */
  allIds: TId[];
};

/** Entity id selector or field name. */
export type EntityIdSelector<TEntity, TId extends string | number = string | number> =
  | keyof TEntity & string
  | ((entity: TEntity) => TId);

/** Handle returned by `mesh.resource`. */
export type ResourceHandle<TParams = void, TData = unknown> = {
  /** Registered resource name. */
  readonly resourceName: string;
  /** Internal marker for typed StateMesh references. */
  readonly kind: "statemesh.resource";
  /** Fetch data for this resource. */
  fetch: (params?: TParams, options?: ResourceFetchOptions) => Promise<TData>;
  /** Fetch without forcing a network call when cached data is fresh. */
  preload: (params?: TParams, options?: ResourceFetchOptions) => Promise<TData>;
  /** Alias for `preload`, named for common React data-loading vocabulary. */
  prefetch: (params?: TParams, options?: ResourceFetchOptions) => Promise<TData>;
  /** Fetch the next page for pagination/infinite resources. */
  fetchNextPage: (params?: TParams, options?: ResourceFetchOptions) => Promise<TData>;
  /** Read the current status for a params entry. */
  get: (params?: TParams) => ResourceStatus<TData, TParams>;
  /** Write cached data manually. */
  setData: (params: TParams | undefined, updater: TData | ((current: TData | null) => TData), options?: ResourceSetDataOptions) => void;
  /** Mark this resource stale, optionally refetching it. */
  invalidate: (invalidation?: ResourceInvalidation) => Promise<void>;
  /** Subscribe to one params entry. */
  subscribe: (listener: () => void, params?: TParams) => Unsubscribe;
};

/** Mutation lifecycle status. */
export type MutationStatusValue = "idle" | "pending" | "queued" | "success" | "error";

/** Runtime status for one mutation. */
export type MutationStatus<TResult = unknown> = {
  /** Current lifecycle state. */
  status: MutationStatusValue;
  /** True while the mutation is running. */
  pending: boolean;
  /** True while the latest mutation payload is queued for reconnect. */
  queued: boolean;
  /** True after a successful mutation. */
  success: boolean;
  /** Last successful result. */
  data: TResult | null;
  /** Last error, if the mutation failed. */
  error: Error | null;
  /** Last payload passed to the mutation. */
  lastPayload: unknown;
  /** Start timestamp in milliseconds. */
  startedAt: number | null;
  /** Finish timestamp in milliseconds. */
  finishedAt: number | null;
  /** Duration in milliseconds. */
  duration: number | null;
  /** Number of runs attempted. */
  runs: number;
  /** Number of queued payloads for this mutation. */
  queueSize: number;
};

/** Offline queue configuration for a mutation. */
export type MutationOfflineOptions = {
  /** Queue the mutation when `navigator.onLine === false`. Defaults to true. */
  queue?: boolean;
  /** Flush queued mutations when the browser comes back online. Defaults to true. */
  flushOnReconnect?: boolean;
};

/** One queued offline mutation payload. */
export type QueuedMutation<TPayload = unknown> = {
  /** Unique queue item id. */
  id: string;
  /** Registered mutation name. */
  name: string;
  /** Payload that will be passed to the mutation. */
  payload: TPayload;
  /** Queue timestamp. */
  queuedAt: number;
};

/** Context passed to mutation callbacks. */
export type MutationContext<TState, TPayload = void> = {
  /** Registered mutation name. */
  name: string;
  /** Payload passed to `run`. */
  payload: TPayload;
  /** Abort signal for the current run. */
  signal: AbortSignal;
  /** Current mesh instance. */
  mesh: Mesh<TState>;
  /** Read cached resource data. */
  getResourceData: <TData = unknown, TParams = unknown>(resource: string | ResourceHandle<TParams, TData>, params?: TParams) => TData | null;
  /** Write cached resource data. */
  setResourceData: <TData = unknown, TParams = unknown>(
    resource: string | ResourceHandle<TParams, TData>,
    params: TParams | undefined,
    updater: TData | ((current: TData | null) => TData),
    options?: ResourceSetDataOptions
  ) => void;
  /** Invalidate resources from inside the mutation. */
  invalidate: (invalidation?: ResourceInvalidation) => Promise<void>;
};

/** Defines an API/server mutation with optimistic update, rollback, invalidation, and refetch. */
export type MutationDefinition<TState, TPayload = void, TResult = unknown> = {
  /** Mutate remote/API data. */
  mutate: (payload: TPayload, context: MutationContext<TState, TPayload>) => MaybePromise<TResult>;
  /** Optimistically update mesh state and/or resource cache before the API call finishes. */
  optimistic?: (state: TState, payload: TPayload, context: MutationContext<TState, TPayload>) => MaybePromise<void>;
  /** Commit successful mutation data into mesh state. */
  commit?: (state: TState, result: TResult, payload: TPayload, context: MutationContext<TState, TPayload>) => MaybePromise<void>;
  /** Restore pre-mutation state/cache on failure. Defaults to true when `optimistic` is defined. */
  rollback?: boolean | ((state: TState, error: Error, payload: TPayload, context: MutationContext<TState, TPayload>) => MaybePromise<void>);
  /** Called after success. */
  onSuccess?: (result: TResult, payload: TPayload, context: MutationContext<TState, TPayload>) => MaybePromise<void>;
  /** Called after failure. */
  onError?: (error: Error, payload: TPayload, context: MutationContext<TState, TPayload>) => MaybePromise<void>;
  /** Tags to invalidate after success. */
  invalidate?: readonly ResourceTag[] | ((result: TResult, payload: TPayload) => readonly ResourceTag[]);
  /** Refetch invalidated resources after success. Defaults to `active`. */
  refetch?: boolean | "active";
  /** How to handle overlapping runs of the same mutation. Defaults to `block`. */
  concurrency?: TransactionConcurrencyPolicy;
  /** Queue this mutation while offline and replay it on reconnect. */
  offline?: boolean | MutationOfflineOptions;
};

/** Handle returned by `mesh.mutation`. */
export type MutationHandle<TPayload = void, TResult = unknown> = MutationStatus<TResult> & {
  /** Registered mutation name. */
  readonly mutationName: string;
  /** Internal marker for typed StateMesh references. */
  readonly kind: "statemesh.mutation";
  /** Run the mutation. */
  run: (payload: TPayload) => Promise<TResult>;
  /** Reset mutation status to idle. */
  reset: () => void;
};

/** Options for manual subscriptions. */
export type MeshSubscriptionOptions<TSelected> = {
  /** Equality function used to avoid unnecessary listener calls. Defaults to `Object.is`. */
  equality?: EqualityFn<TSelected>;
  /** Call the listener immediately with the current value. */
  fireImmediately?: boolean;
};

/** Options for creating a mesh. */
export type MeshOptions<TState> = {
  /** Human-readable mesh name used for persistence keys and events. */
  name?: string;
  /** Initial state. StateMesh clones this and never mutates the object you pass in. */
  state: TState;
  /** Reserved devtools flag for future integrations. */
  devtools?: boolean;
  /** Reserved logger flag for future integrations. */
  logger?: boolean;
  /** Runtime profiler options. */
  profiler?: MeshProfilerOptions;
};

/**
 * StateMesh instance.
 *
 * Create one mesh per app or feature boundary, register actions/transactions/computed values once,
 * then pass it to `StateMeshProvider`.
 */
export type Mesh<TState = unknown> = {
  /** Mesh name. */
  readonly name: string;
  /** Return the current state object. */
  getState: () => TState;
  /** Return a clone of the original initial state. */
  getInitialState: () => TState;
  /** Select a value for React's `useSyncExternalStore` client snapshot. */
  getSelectedSnapshot: <TSelected>(selectorOrPath: ((state: TState) => TSelected) | MeshPath) => TSelected;
  /** Select a value for React's `useSyncExternalStore` server snapshot. */
  getSelectedServerSnapshot: <TSelected>(selectorOrPath: ((state: TState) => TSelected) | MeshPath) => TSelected;
  /** Update state with a partial value, full replacement, or draft updater. */
  setState: (input: MeshSetStateInput<TState>, options?: MeshSetStateOptions) => void;
  /** Update one state path with a value or updater function. */
  setPath: (path: MeshPath, valueOrUpdater: unknown | ((currentValue: unknown) => unknown), metadata?: Record<string, unknown>) => void;
  /** Restore the initial state. */
  reset: () => void;
  /** Cleanup subscriptions, plugins, URL listeners, forms, transactions, and internal registries. */
  destroy: () => void;
  /** Subscribe to a selector or path. The listener runs only when the selected value changes. */
  subscribe: <TSelected>(
    selectorOrPath: ((state: TState) => TSelected) | MeshPath,
    listener: (selected: TSelected, previous: TSelected, event?: MeshEvent) => void,
    options?: MeshSubscriptionOptions<TSelected>
  ) => Unsubscribe;
  /** Register a named synchronous action and return its callable function. */
  action: <TPayload = void, TResult = void>(
    name: string,
    handler: MeshActionHandler<TState, TPayload, TResult>,
    options?: MeshRegistryOptions
  ) => MeshAction<TPayload, TResult>;
  /** Run a previously registered action by name. */
  runAction: <TPayload = void, TResult = void>(name: string, payload: TPayload) => TResult;
  /** Register a named transaction and return its handle. */
  transaction: <TPayload = void, TResult = unknown>(
    name: string,
    definition: TransactionDefinition<TState, TPayload, TResult>,
    options?: TransactionRegistrationOptions
  ) => TransactionHandle<TPayload, TResult>;
  /** Run a previously registered transaction by name. */
  runTransaction: <TPayload = void, TResult = unknown>(name: string, payload: TPayload) => Promise<TResult>;
  /** Get the current status for a transaction. */
  getTransactionStatus: <TResult = unknown>(name: string) => TransactionStatus<TResult>;
  /** Subscribe to status changes for one transaction. */
  subscribeTransaction: (name: string, listener: () => void) => Unsubscribe;
  /** Cancel an in-flight transaction. */
  cancelTransaction: (name: string) => void;
  /** Reset one transaction status back to idle. */
  resetTransaction: (name: string) => void;
  /** Retry one transaction with its previous payload. */
  retryTransaction: <TResult = unknown>(name: string) => Promise<TResult>;
  /** Register cached API/server data. */
  resource: <TParams = void, TData = unknown, TPageParam = unknown>(
    name: string,
    definition: ResourceDefinition<TState, TParams, TData, TPageParam>,
    options?: MeshRegistryOptions
  ) => ResourceHandle<TParams, TData>;
  /** Fetch a registered resource by name. */
  fetchResource: <TParams = void, TData = unknown>(
    name: string,
    params?: TParams,
    options?: ResourceFetchOptions
  ) => Promise<TData>;
  /** Alias for `fetchResource` with `force: false`, intended for route/link prefetching. */
  prefetchResource: <TParams = void, TData = unknown>(
    name: string,
    params?: TParams,
    options?: ResourceFetchOptions
  ) => Promise<TData>;
  /** Fetch the next page for a registered pagination/infinite resource. */
  fetchNextResourcePage: <TParams = void, TData = unknown>(
    name: string,
    params?: TParams,
    options?: ResourceFetchOptions
  ) => Promise<TData>;
  /** Read current resource status by name and params. */
  getResourceStatus: <TData = unknown, TParams = unknown>(name: string, params?: TParams) => ResourceStatus<TData, TParams>;
  /** Write resource cache data manually. */
  setResourceData: <TData = unknown, TParams = unknown>(
    name: string,
    params: TParams | undefined,
    updater: TData | ((current: TData | null) => TData),
    options?: ResourceSetDataOptions
  ) => void;
  /** Mark resources stale by name, tag, or predicate, optionally refetching. */
  invalidateResources: (invalidation?: ResourceInvalidation) => Promise<void>;
  /** Subscribe to one resource cache entry. */
  subscribeResource: (name: string, listener: () => void, options?: ResourceSubscribeOptions) => Unsubscribe;
  /** Serialize resource cache entries for SSR hydration or persistence. */
  dehydrateResources: (options?: ResourceDehydrateOptions) => ResourceSnapshot;
  /** Restore resource cache entries from a snapshot. */
  hydrateResources: (snapshot: ResourceSnapshot, options?: ResourceHydrateOptions) => void;
  /** Persist selected resource cache entries to storage. */
  persistResources: (options?: ResourcePersistOptions) => Unsubscribe;
  /** Serialize state, resources, URL state, forms, and queued mutations. */
  dehydrate: (options?: MeshDehydrateOptions) => MeshDehydratedSnapshot;
  /** Restore a full mesh snapshot. */
  hydrate: (snapshot: MeshDehydratedSnapshot, options?: MeshHydrateOptions) => void;
  /** Register an API/server mutation. */
  mutation: <TPayload = void, TResult = unknown>(
    name: string,
    definition: MutationDefinition<TState, TPayload, TResult>,
    options?: MeshRegistryOptions
  ) => MutationHandle<TPayload, TResult>;
  /** Run a registered mutation by name. */
  runMutation: <TPayload = void, TResult = unknown>(name: string, payload: TPayload) => Promise<TResult>;
  /** Read current mutation status. */
  getMutationStatus: <TResult = unknown>(name: string) => MutationStatus<TResult>;
  /** Subscribe to mutation status changes. */
  subscribeMutation: (name: string, listener: () => void) => Unsubscribe;
  /** Reset mutation status to idle. */
  resetMutation: (name: string) => void;
  /** Inspect queued offline mutations. */
  getQueuedMutations: () => QueuedMutation[];
  /** Flush queued offline mutations immediately. */
  runQueuedMutations: () => Promise<void>;
  /** Clear queued offline mutations. */
  clearQueuedMutations: (error?: Error) => void;
  /** Persist and restore the offline mutation queue. */
  persistQueuedMutations: (options?: MutationQueuePersistOptions) => Unsubscribe;
  /** Run StateMesh Doctor diagnostics for common production-readiness issues. */
  doctor: (options?: MeshDoctorOptions) => MeshDoctorReport;
  /** Read retained performance profiler samples. */
  getProfilerSamples: (filter?: MeshProfilerFilter) => MeshProfilerSample[];
  /** Clear retained performance profiler samples. */
  clearProfilerSamples: () => void;
  /** Subscribe to profiler sample changes. */
  subscribeProfiler: (listener: () => void) => Unsubscribe;
  /** Normalize entities into `{ byId, allIds }`. */
  normalizeEntities: <TEntity, TId extends string | number = string | number>(
    entities: readonly TEntity[],
    selectId: EntityIdSelector<TEntity, TId>
  ) => EntityCollection<TEntity, TId>;
  /** Merge entities into an existing normalized collection. */
  mergeEntities: <TEntity, TId extends string | number = string | number>(
    collection: EntityCollection<TEntity, TId> | null | undefined,
    entities: readonly TEntity[],
    selectId: EntityIdSelector<TEntity, TId>
  ) => EntityCollection<TEntity, TId>;
  /** Remove entity ids from a normalized collection. */
  removeEntities: <TEntity, TId extends string | number = string | number>(
    collection: EntityCollection<TEntity, TId>,
    ids: readonly TId[]
  ) => EntityCollection<TEntity, TId>;
  /** Convert a normalized collection back to an array. */
  denormalizeEntities: <TEntity, TId extends string | number = string | number>(
    collection: EntityCollection<TEntity, TId>
  ) => TEntity[];
  /** Register a cached computed value. */
  computed: <TValue>(name: string, definition: ComputedDefinition<TState, TValue>, options?: MeshRegistryOptions) => void;
  /** Read a computed value, recomputing it only when dependencies changed. */
  getComputed: <TValue = unknown>(name: string) => TValue;
  /** Subscribe to changes for one computed value. */
  subscribeComputed: (name: string, listener: () => void) => Unsubscribe;
  /** Persist whitelisted state paths. */
  persist: (options: PersistOptions<TState>) => Unsubscribe;
  /** Register URL-backed state defaults and options. */
  urlState: <TValues extends Record<string, unknown>>(
    name: string,
    defaults: TValues,
    options?: UrlStateOptions<TValues>
  ) => void;
  /** Get registered URL state values. */
  getUrlState: <TValues extends Record<string, unknown>>(name: string) => TValues;
  /** Merge or update registered URL state values. */
  setUrlState: <TValues extends Record<string, unknown>>(
    name: string,
    valueOrUpdater: Partial<TValues> | ((current: TValues) => Partial<TValues> | TValues)
  ) => void;
  /** Subscribe to one URL state entry. */
  subscribeUrlState: (name: string, listener: () => void) => Unsubscribe;
  /** Register a lightweight form. */
  form: <TValues extends Record<string, unknown>>(name: string, definition: FormDefinition<TValues>, options?: MeshRegistryOptions) => void;
  /** Get a form API by name. */
  getForm: <TValues extends Record<string, unknown>>(name: string) => FormApi<TValues>;
  /** Subscribe to changes for one form. */
  subscribeForm: (name: string, listener: () => void) => Unsubscribe;
  /** Capture a state snapshot that can be restored later. */
  snapshot: (label?: string) => Snapshot<TState>;
  /** Restore a snapshot by ID. */
  restore: (snapshotId: string) => void;
  /** Register middleware for events. */
  middleware: (handler: MeshMiddleware<TState>) => Unsubscribe;
  /** Register a guard that can block actions, transactions, or mutations before they run. */
  guard: {
    (handler: MeshGuard<TState>): Unsubscribe;
    (target: MeshGuardTarget, handler: MeshGuard<TState>): Unsubscribe;
  };
  /** Register a plugin. Duplicate plugin names throw. */
  use: (plugin: MeshPlugin<TState>) => Unsubscribe;
  /** Subscribe to all StateMesh events. */
  onEvent: (listener: (event: MeshEvent) => MaybePromise<void>) => Unsubscribe;
  /** Emit an event to middleware/plugin listeners. */
  emit: (event: MeshEvent) => void;
};
