import {
  ActionError,
  ComputedError,
  DuplicateRegistrationError,
  FormError,
  PersistenceError,
  SelectorError,
  StateMeshError,
  TransactionError,
  TransactionRollbackError,
  UrlStateError
} from "../errors";
import { resolveStorageAdapter } from "../persist/storage";
import { createBatcher, cloneState, debounce, getPath, isBrowser, pickPaths, setPath as setValueAtPath } from "../utils";
import type { EqualityFn } from "../utils";
import type {
  ComputedDefinition,
  FormApi,
  FormDefinition,
  FormErrors,
  FormState,
  Mesh,
  MeshAction,
  MeshActionContext,
  MeshEvent,
  MeshMiddleware,
  MeshOptions,
  MeshPath,
  MaybePromise,
  MeshPlugin,
  MeshRegistryOptions,
  MeshSetStateInput,
  MeshSetStateOptions,
  MeshSubscriptionOptions,
  PersistOptions,
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
export function createMesh<TState>(options: MeshOptions<TState>): Mesh<TState> {
  const name = options.name ?? "statemesh";
  const initialState = cloneState(options.state);
  let state = cloneState(options.state);
  let destroyed = false;

  const subscriptions = new Set<Subscription<TState, unknown>>();
  const eventListeners = new Set<(event: MeshEvent) => void | Promise<void>>();
  const middlewares = new Set<MeshMiddleware<TState>>();
  const snapshots = new Map<string, Snapshot<TState>>();
  const actions = new Map<string, (state: TState, payload: unknown, context: unknown) => unknown>();
  const computedEntries = new Map<string, ComputedEntry<TState, unknown>>();
  const transactionDefinitions = new Map<string, TransactionDefinition<TState, unknown, unknown>>();
  const transactionOptions = new Map<string, TransactionRegistrationOptions>();
  const transactionStatuses = new Map<string, TransactionStatus>();
  const transactionListeners = new Map<string, Set<() => void>>();
  const transactionRuntime = new Map<string, TransactionRuntime>();
  const urlStates = new Map<string, UrlStateEntry<Record<string, unknown>>>();
  const formEntries = new Map<string, FormEntry<Record<string, unknown>>>();
  const pluginCleanups = new Map<string, Unsubscribe | void>();
  const pendingEvents: MeshEvent[] = [];

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
    middleware,
    use,
    onEvent,
    emit
  } satisfies Mesh<TState>;

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
    for (const entry of urlStates.values()) {
      entry.cleanup();
      entry.listeners.clear();
    }
    urlStates.clear();
    for (const entry of formEntries.values()) {
      entry.listeners.clear();
    }
    formEntries.clear();
    for (const cleanup of pluginCleanups.values()) {
      cleanup?.();
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

    try {
      const value = entry.definition.compute(state);
      entry.value = value;
      entry.hasValue = true;
      entry.dirty = false;
      entry.depValues = readDependencyValues(entry.definition.deps);
      return value as TValue;
    } catch (error) {
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
    assertCanRegister(transactionDefinitions, "transaction", transactionName, options.replace);
    const existingRuntime = transactionRuntime.get(transactionName);
    if (existingRuntime && options.replace) {
      existingRuntime.cancelled = true;
      existingRuntime.controller?.abort();
    }
    transactionDefinitions.set(transactionName, definition as TransactionDefinition<TState, unknown, unknown>);
    transactionOptions.set(transactionName, {
      concurrency: options.concurrency ?? "takeLatest",
      replace: options.replace
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

  function getTransactionStatus<TResult = unknown>(transactionName: string): TransactionStatus<TResult> {
    return {
      ...(transactionStatuses.get(transactionName) ?? DEFAULT_TRANSACTION_STATUS)
    } as TransactionStatus<TResult>;
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

  function applyDraft(mutator: (draft: TState) => void, event: MeshEvent): void {
    batcher.batch(() => {
      const draft = cloneState(state);
      mutator(draft);
      commitState(draft, event);
    });
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
    assertCanRegister(urlStates, "urlState", urlName, urlOptions.replace);
    const existing = urlStates.get(urlName);
    if (existing && urlOptions.replace) {
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
    assertCanRegister(formEntries, "form", formName, options.replace);
    const existing = formEntries.get(formName);
    const initialValues = cloneState(definition.initialValues);
    formEntries.set(formName, {
      definition: definition as FormDefinition<Record<string, unknown>>,
      initialValues,
      state: {
        values: cloneState(initialValues),
        errors: {},
        touched: {},
        dirty: false,
        submitting: false,
        submitted: false,
        submitError: null
      },
      listeners: existing?.listeners ?? new Set()
    } as FormEntry<Record<string, unknown>>);
    if (existing && options.replace) {
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

    const api = {
      ...entry.state,
      field: <K extends keyof TValues & string>(fieldName: K) => ({
        name: fieldName,
        value: entry.state.values[fieldName],
        onChange: (eventOrValue: unknown) => {
          const value = readFieldValue(eventOrValue);
          setFormValue(entry, formName, fieldName, value as TValues[K]);
        },
        onBlur: () => {
          entry.state = {
            ...entry.state,
            touched: { ...entry.state.touched, [fieldName]: true }
          };
          notifyForm(formName, fieldName);
        }
      }),
      setValue: <K extends keyof TValues & string>(fieldName: K, value: TValues[K]) => {
        setFormValue(entry, formName, fieldName, value);
      },
      setError: <K extends keyof TValues & string>(fieldName: K, error: string | null) => {
        entry.state = {
          ...entry.state,
          errors: updateError(entry.state.errors, fieldName, error)
        };
        notifyForm(formName, fieldName);
      },
      reset: () => {
        entry.state = {
          values: cloneState(entry.initialValues),
          errors: {},
          touched: {},
          dirty: false,
          submitting: false,
          submitted: false,
          submitError: null
        };
        notifyForm(formName);
      },
      validate: () => validateForm(entry, formName),
      submit: async (event?: { preventDefault?: () => void }) => {
        event?.preventDefault?.();
        const errors = await validateForm(entry, formName);
        if (Object.keys(errors).length > 0) return;

        entry.state = { ...entry.state, submitting: true, submitError: null };
        notifyForm(formName);

        try {
          const submitter = entry.definition.submit;
          if (typeof submitter === "string") {
            await runTransaction(submitter, entry.state.values);
          } else if (typeof submitter === "function") {
            await submitter(entry.state.values);
          }
          entry.state = { ...entry.state, submitting: false, submitted: true };
          notifyForm(formName);
        } catch (error) {
          const formError = toError(error);
          const mappedErrors = entry.definition.mapServerErrors?.(formError) ?? {};
          entry.state = {
            ...entry.state,
            submitting: false,
            submitError: formError,
            errors: { ...entry.state.errors, ...mappedErrors }
          };
          notifyForm(formName);
        }
      }
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

  function middleware(handler: MeshMiddleware<TState>): Unsubscribe {
    middlewares.add(handler);
    return () => middlewares.delete(handler);
  }

  function use(plugin: MeshPlugin<TState>): Unsubscribe {
    if (pluginCleanups.has(plugin.name)) {
      throw new DuplicateRegistrationError(`Plugin "${plugin.name}" is already registered.`, {
        metadata: { plugin: plugin.name }
      });
    }

    const cleanup = plugin.setup({
      mesh,
      emit: dispatchEvent,
      onEvent
    });
    pluginCleanups.set(plugin.name, cleanup);

    return () => {
      cleanup?.();
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
    dispatchEvent({ type: "form.changed", name: formName, field, timestamp: Date.now() });
  }

  function setFormValue<TValues extends Record<string, unknown>, K extends keyof TValues & string>(
    entry: FormEntry<TValues>,
    formName: string,
    fieldName: K,
    value: TValues[K]
  ): void {
    entry.state = {
      ...entry.state,
      values: { ...entry.state.values, [fieldName]: value },
      touched: { ...entry.state.touched, [fieldName]: true },
      dirty: true
    };
    notifyForm(formName, fieldName);
  }

  async function validateForm<TValues extends Record<string, unknown>>(
    entry: FormEntry<TValues>,
    formName: string
  ): Promise<FormErrors<TValues>> {
    try {
      const errors = (await entry.definition.validate?.(entry.state.values)) ?? {};
      entry.state = { ...entry.state, errors };
      notifyForm(formName);
      return errors;
    } catch (error) {
      throw new FormError(`Validation for form "${formName}" failed.`, {
        cause: error,
        metadata: { form: formName }
      });
    }
  }
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
      const paramName = getUrlParamName(name, key, options);
      const serialized = serializeUrlValue(values[key], options.serializers?.[key]);
      if (serialized === null || serialized === undefined || serialized === "") {
        url.searchParams.delete(paramName);
      } else {
        url.searchParams.set(paramName, serialized);
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
  if (options.paramPrefix === false) return key;
  return options.paramPrefix ? `${options.paramPrefix}.${key}` : key;
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
): void {
  if (!replace && registry.has(registrationName)) {
    throw new DuplicateRegistrationError(`${kind} "${registrationName}" is already registered.`, {
      metadata: { kind, name: registrationName }
    });
  }
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
