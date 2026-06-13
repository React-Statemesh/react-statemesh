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
  | { type: "url.changed"; name: string; timestamp: number; metadata?: Record<string, unknown> };

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
  /** Per-field URL serializers. */
  serializers?: Partial<{ [K in keyof TValues]: UrlSerializer<TValues[K]> }>;
};

/** Form error map keyed by field name. */
export type FormErrors<TValues extends Record<string, unknown>> = Partial<Record<keyof TValues & string, string>>;

/** Form touched map keyed by field name. */
export type FormTouched<TValues extends Record<string, unknown>> = Partial<Record<keyof TValues & string, boolean>>;

/** Current form state. */
export type FormState<TValues extends Record<string, unknown> = Record<string, unknown>> = {
  /** Current form values. */
  values: TValues;
  /** Field errors. */
  errors: FormErrors<TValues>;
  /** Field touched flags. */
  touched: FormTouched<TValues>;
  /** True after any value changes from the initial values. */
  dirty: boolean;
  /** True while submit is running. */
  submitting: boolean;
  /** True after a successful submit. */
  submitted: boolean;
  /** Last submit error. */
  submitError: Error | null;
};

/** Definition used by `mesh.form`. */
export type FormDefinition<TValues extends Record<string, unknown> = Record<string, unknown>> = {
  /** Initial values for the form. */
  initialValues: TValues;
  /** Optional client-side validator. Return an object of field errors. */
  validate?: (values: TValues) => FormErrors<TValues> | Promise<FormErrors<TValues>>;
  /** Transaction name or custom submit function. */
  submit?: string | ((values: TValues) => MaybePromise<unknown>);
  /** Map server/transaction errors to field errors. */
  mapServerErrors?: (error: Error) => FormErrors<TValues>;
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

/** Runtime form API returned by `mesh.getForm` and `useMeshForm`. */
export type FormApi<TValues extends Record<string, unknown> = Record<string, unknown>> = FormState<TValues> & {
  /** Return input props for one field. */
  field: <K extends keyof TValues & string>(name: K) => FormFieldProps<TValues[K]>;
  /** Set one field value and mark the form dirty. */
  setValue: <K extends keyof TValues & string>(name: K, value: TValues[K]) => void;
  /** Set or clear one field error. */
  setError: <K extends keyof TValues & string>(name: K, error: string | null) => void;
  /** Reset values, errors, touched state, and submit metadata. */
  reset: () => void;
  /** Run validation and update `errors`. */
  validate: () => Promise<FormErrors<TValues>>;
  /** Submit through the configured transaction or submit function. */
  submit: (event?: { preventDefault?: () => void }) => Promise<void>;
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
  /** Register a plugin. Duplicate plugin names throw. */
  use: (plugin: MeshPlugin<TState>) => Unsubscribe;
  /** Subscribe to all StateMesh events. */
  onEvent: (listener: (event: MeshEvent) => MaybePromise<void>) => Unsubscribe;
  /** Emit an event to middleware/plugin listeners. */
  emit: (event: MeshEvent) => void;
};
