import { ApiClientError } from "../errors";
import type { MaybePromise } from "../core/types";

/** Response parser mode for the built-in API client. */
export type ApiParseMode = "json" | "text" | "blob" | "arrayBuffer" | "response" | "void";

/** Events emitted by the built-in API client. */
export type ApiClientEvent =
  | { type: "api.request.started"; url: string; method: string; attempt: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "api.upload.progress"; url: string; method: string; loaded: number; total: number | null; percent: number | null; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "api.request.retrying"; url: string; method: string; attempt: number; delay: number; error: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "api.request.timeout"; url: string; method: string; timeout: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "api.request.succeeded"; url: string; method: string; status: number; duration: number; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "api.request.failed"; url: string; method: string; status?: number; error: unknown; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "api.auth.refresh.started"; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "api.auth.refresh.succeeded"; timestamp: number; metadata?: Record<string, unknown> }
  | { type: "api.auth.refresh.failed"; error: unknown; timestamp: number; metadata?: Record<string, unknown> };

/** Upload progress emitted by `api.upload`. */
export type ApiUploadProgress = {
  /** Bytes uploaded so far. */
  loaded: number;
  /** Total upload bytes when the browser can compute it. */
  total: number | null;
  /** Upload progress from 0 to 100 when total is known. */
  percent: number | null;
  /** Browser-native length computable flag. */
  lengthComputable: boolean;
};

/** Context passed to API retry predicates and delay functions. */
export type ApiRetryContext = {
  /** 1-based retry attempt number. */
  attempt: number;
  /** Maximum configured retry attempts. */
  attempts: number;
  /** Request URL. */
  url: string;
  /** HTTP method. */
  method: string;
  /** Response status when available. */
  status?: number;
  /** Response object when available. */
  response?: Response;
  /** Error object for network, timeout, or normalized HTTP failures. */
  error?: unknown;
};

/** Fully controllable retry options for the built-in API client. */
export type ApiRetryOptions = {
  /** Number of retries after the first request. Defaults to 0. */
  attempts?: number;
  /** Delay in milliseconds or a function. Defaults to exponential backoff capped at 30s. */
  delay?: number | ((context: ApiRetryContext) => number);
  /** HTTP statuses that should retry. Defaults to 408, 429, 500, 502, 503, 504. */
  retryOn?: readonly number[] | ((context: ApiRetryContext) => boolean);
  /** Retry network errors. Defaults to true. */
  retryNetworkErrors?: boolean;
  /** Retry timeout errors. Defaults to false. */
  retryTimeouts?: boolean;
  /** Optional jitter. `true` uses full jitter, a number is a +/- fraction, and a function is fully custom. */
  jitter?: boolean | number | ((delay: number, context: ApiRetryContext) => number);
};

/** Options used to create the built-in API client. */
export type ApiClientOptions = {
  /** Base URL prepended to relative request paths. */
  baseUrl?: string;
  /** Custom fetch implementation for tests, SSR, or React Native. Defaults to global `fetch`. */
  fetcher?: typeof fetch;
  /** Static or dynamic headers applied to every request. */
  headers?: HeadersInit | (() => MaybePromise<HeadersInit>);
  /** Return the current access token. */
  getAccessToken?: () => MaybePromise<string | null | undefined>;
  /** Refresh auth when a request should be retried. Concurrent refreshes are deduped. */
  refreshAuth?: () => MaybePromise<string | null | undefined | void>;
  /** Decide whether a response should trigger auth refresh. Defaults to HTTP 401. */
  shouldRefreshAuth?: (response: Response) => boolean;
  /** Abort requests after this many milliseconds. Disabled by default. */
  timeout?: number;
  /** Retry failed requests. Disabled by default. */
  retry?: number | false | ApiRetryOptions;
  /** Observe API client events for logging/devtools bridges. */
  onEvent?: (event: ApiClientEvent) => void;
};

/** Options for one API request. */
export type ApiRequestOptions<TBody = unknown> = Omit<RequestInit, "body" | "headers" | "method" | "signal"> & {
  /** HTTP method. Defaults to GET. */
  method?: string;
  /** Query params appended to the URL. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Request body. Plain objects are JSON encoded automatically. */
  body?: TBody;
  /** Request headers. */
  headers?: HeadersInit;
  /** Abort signal. */
  signal?: AbortSignal;
  /** Response parser mode. Defaults to JSON when content type is JSON, otherwise text. */
  parseAs?: ApiParseMode;
  /** Disable Authorization header injection for this request. */
  auth?: boolean;
  /** Retry once after auth refresh. Defaults to true. */
  retryAuth?: boolean;
  /** Override global timeout for this request. Use `false` to disable. */
  timeout?: number | false;
  /** Override global retry for this request. Use `false` to disable. */
  retry?: number | false | ApiRetryOptions;
  /** Extra metadata included in API client events. */
  metadata?: Record<string, unknown>;
  /** Upload progress callback. Uses XHR in browsers. */
  onUploadProgress?: (progress: ApiUploadProgress) => void;
};

/** Built-in API client returned by `createApiClient`. */
export type ApiClient = {
  /** Run an arbitrary HTTP request. */
  request: <TResult = unknown, TBody = unknown>(path: string, options?: ApiRequestOptions<TBody>) => Promise<TResult>;
  /** Run a GET request. */
  get: <TResult = unknown>(path: string, options?: ApiRequestOptions<never>) => Promise<TResult>;
  /** Run a POST request. */
  post: <TResult = unknown, TBody = unknown>(path: string, body?: TBody, options?: ApiRequestOptions<TBody>) => Promise<TResult>;
  /** Run a PUT request. */
  put: <TResult = unknown, TBody = unknown>(path: string, body?: TBody, options?: ApiRequestOptions<TBody>) => Promise<TResult>;
  /** Run a PATCH request. */
  patch: <TResult = unknown, TBody = unknown>(path: string, body?: TBody, options?: ApiRequestOptions<TBody>) => Promise<TResult>;
  /** Run a DELETE request. */
  delete: <TResult = unknown>(path: string, options?: ApiRequestOptions<never>) => Promise<TResult>;
  /** Upload a raw body, Blob, File, or FormData with optional progress events. */
  upload: <TResult = unknown, TBody = BodyInit>(path: string, body: TBody, options?: ApiRequestOptions<TBody>) => Promise<TResult>;
};

type ResolvedRetryOptions = Required<Pick<ApiRetryOptions, "attempts" | "retryNetworkErrors" | "retryTimeouts">> &
  Pick<ApiRetryOptions, "delay" | "retryOn" | "jitter">;

const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504] as const;

/**
 * Create a small production API client for resources and mutations.
 *
 * It handles base URLs, query params, JSON bodies, timeouts, retries, HTTP errors, event hooks, and single-flight auth refresh.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const fetcher = options.fetcher ?? globalThis.fetch;
  let refreshPromise: Promise<string | null | undefined | void> | null = null;
  let refreshedToken: string | null | undefined;

  if (!fetcher) {
    throw new ApiClientError("No fetch implementation is available for createApiClient.");
  }

  async function request<TResult = unknown, TBody = unknown>(
    path: string,
    requestOptions: ApiRequestOptions<TBody> = {}
  ): Promise<TResult> {
    return requestWithRetry<TResult, TBody>(path, requestOptions, false, 0);
  }

  async function requestWithRetry<TResult, TBody>(
    path: string,
    requestOptions: ApiRequestOptions<TBody>,
    authRetried: boolean,
    retryAttempt: number
  ): Promise<TResult> {
    const startedAt = Date.now();
    const method = (requestOptions.method ?? "GET").toUpperCase();
    const url = buildUrl(options.baseUrl, path, requestOptions.query);
    const retryOptions = resolveRetryOptions(requestOptions.retry, options.retry);
    options.onEvent?.({
      type: "api.request.started",
      url,
      method,
      attempt: retryAttempt + 1,
      timestamp: startedAt,
      metadata: requestOptions.metadata
    });

    try {
      const response = await runFetchWithTimeout(url, method, requestOptions);
      if (!response.ok) {
        const shouldRefresh = (requestOptions.retryAuth ?? true) &&
          !authRetried &&
          requestOptions.auth !== false &&
          Boolean(options.refreshAuth) &&
          (options.shouldRefreshAuth?.(response) ?? response.status === 401);

        if (shouldRefresh) {
          await refreshAuth(requestOptions.metadata);
          return requestWithRetry<TResult, TBody>(path, requestOptions, true, retryAttempt);
        }

        const httpError = new ApiClientError(`API request failed with HTTP ${response.status}.`, {
          status: response.status,
          response,
          metadata: { url, method, attempt: retryAttempt + 1 }
        });
        const retryContext: ApiRetryContext = {
          attempt: retryAttempt + 1,
          attempts: retryOptions.attempts,
          url,
          method,
          status: response.status,
          response,
          error: httpError
        };

        if (shouldRetry(retryOptions, retryContext)) {
          await waitForRetry(retryOptions, retryContext, requestOptions.metadata);
          return requestWithRetry<TResult, TBody>(path, requestOptions, authRetried, retryAttempt + 1);
        }

        options.onEvent?.({ type: "api.request.failed", url, method, status: response.status, error: httpError, timestamp: Date.now(), metadata: requestOptions.metadata });
        throw httpError;
      }

      const result = await parseResponse<TResult>(response, requestOptions.parseAs);
      const finishedAt = Date.now();
      options.onEvent?.({
        type: "api.request.succeeded",
        url,
        method,
        status: response.status,
        duration: finishedAt - startedAt,
        timestamp: finishedAt,
        metadata: requestOptions.metadata
      });
      return result;
    } catch (error) {
      if (error instanceof ApiClientError && error.response) throw error;

      const wrapped = normalizeApiFailure(error, url, method, retryAttempt + 1);
      const retryContext: ApiRetryContext = {
        attempt: retryAttempt + 1,
        attempts: retryOptions.attempts,
        url,
        method,
        status: wrapped.status || undefined,
        response: wrapped.response ?? undefined,
        error: wrapped
      };

      if (shouldRetry(retryOptions, retryContext)) {
        await waitForRetry(retryOptions, retryContext, requestOptions.metadata);
        return requestWithRetry<TResult, TBody>(path, requestOptions, authRetried, retryAttempt + 1);
      }

      options.onEvent?.({ type: "api.request.failed", url, method, status: wrapped.status || undefined, error: wrapped, timestamp: Date.now(), metadata: requestOptions.metadata });
      throw wrapped;
    }
  }

  async function runFetchWithTimeout<TBody>(
    url: string,
    method: string,
    requestOptions: ApiRequestOptions<TBody>
  ): Promise<Response> {
    const timeout = resolveTimeout(requestOptions.timeout, options.timeout);
    if (!timeout) {
      return fetcher(url, await buildRequestInit(requestOptions, method, requestOptions.signal));
    }

    let timedOut = false;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
      options.onEvent?.({
        type: "api.request.timeout",
        url,
        method,
        timeout,
        timestamp: Date.now(),
        metadata: requestOptions.metadata
      });
    }, timeout);

    const signal = mergeAbortSignals(requestOptions.signal, timeoutController.signal);

    try {
      return await fetcher(url, await buildRequestInit(requestOptions, method, signal));
    } catch (error) {
      if (timedOut) {
        throw new ApiClientError("API request timed out.", {
          code: "STATEMESH_API_TIMEOUT",
          cause: error,
          metadata: { url, method, timeout }
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function normalizeApiFailure(error: unknown, url: string, method: string, attempt: number): ApiClientError {
    if (error instanceof ApiClientError) return error;
    const aborted = isAbortError(error);
    return new ApiClientError(aborted ? "API request was aborted." : "API request failed.", {
      code: aborted ? "STATEMESH_API_ABORTED" : "STATEMESH_API_CLIENT_ERROR",
      cause: error,
      metadata: { url, method, attempt, aborted }
    });
  }

  async function waitForRetry(
    retryOptions: ResolvedRetryOptions,
    context: ApiRetryContext,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const retryDelay = getRetryDelay(retryOptions, context);
    options.onEvent?.({
      type: "api.request.retrying",
      url: context.url,
      method: context.method,
      attempt: context.attempt + 1,
      delay: retryDelay,
      error: context.error,
      timestamp: Date.now(),
      metadata
    });
    if (retryDelay > 0) await delay(retryDelay);
  }

  async function buildRequestInit<TBody>(
    requestOptions: ApiRequestOptions<TBody>,
    method: string,
    signal: AbortSignal | undefined
  ): Promise<RequestInit> {
    const {
      body,
      query: _query,
      parseAs: _parseAs,
      auth: _auth,
      retryAuth: _retryAuth,
      timeout: _timeout,
      retry: _retry,
      metadata: _metadata,
      onUploadProgress: _onUploadProgress,
      headers: requestHeaders,
      method: _method,
      signal: _signal,
      ...requestInit
    } = requestOptions;
    const headers = new Headers(await resolveHeaders(options.headers));
    mergeHeaders(headers, requestHeaders);

    if (_auth !== false) {
      const token = refreshedToken ?? await options.getAccessToken?.();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    const init: RequestInit = {
      ...requestInit,
      method,
      headers,
      signal
    };

    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      if (isBodyInit(body)) {
        init.body = body;
      } else {
        if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
        init.body = JSON.stringify(body);
      }
    }

    return init;
  }

  async function refreshAuth(metadata?: Record<string, unknown>): Promise<void> {
    if (!options.refreshAuth) return;
    if (!refreshPromise) {
      options.onEvent?.({ type: "api.auth.refresh.started", timestamp: Date.now(), metadata });
      refreshPromise = Promise.resolve(options.refreshAuth())
        .then((token) => {
          if (typeof token === "string") refreshedToken = token;
          options.onEvent?.({ type: "api.auth.refresh.succeeded", timestamp: Date.now(), metadata });
          return token;
        })
        .catch((error) => {
          options.onEvent?.({ type: "api.auth.refresh.failed", error, timestamp: Date.now(), metadata });
          throw error;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    await refreshPromise;
  }

  async function upload<TResult = unknown, TBody = BodyInit>(
    path: string,
    body: TBody,
    requestOptions: ApiRequestOptions<TBody> = {}
  ): Promise<TResult> {
    const method = (requestOptions.method ?? "POST").toUpperCase();
    const url = buildUrl(options.baseUrl, path, requestOptions.query);

    if (typeof XMLHttpRequest === "undefined") {
      return request<TResult, TBody>(path, { ...requestOptions, method, body });
    }

    const startedAt = Date.now();
    options.onEvent?.({
      type: "api.request.started",
      url,
      method,
      attempt: 1,
      timestamp: startedAt,
      metadata: requestOptions.metadata
    });

    try {
      const response = await runXhrUpload<TResult, TBody>(url, method, body, requestOptions);
      const finishedAt = Date.now();
      options.onEvent?.({
        type: "api.request.succeeded",
        url,
        method,
        status: response.status,
        duration: finishedAt - startedAt,
        timestamp: finishedAt,
        metadata: requestOptions.metadata
      });
      return response.data;
    } catch (error) {
      const wrapped = error instanceof ApiClientError ? error : normalizeApiFailure(error, url, method, 1);
      options.onEvent?.({
        type: "api.request.failed",
        url,
        method,
        status: wrapped.status || undefined,
        error: wrapped,
        timestamp: Date.now(),
        metadata: requestOptions.metadata
      });
      throw wrapped;
    }
  }

  async function runXhrUpload<TResult, TBody>(
    url: string,
    method: string,
    body: TBody,
    requestOptions: ApiRequestOptions<TBody>
  ): Promise<{ data: TResult; status: number }> {
    const init = await buildRequestInit({ ...requestOptions, body }, method, requestOptions.signal);
    const timeout = resolveTimeout(requestOptions.timeout, options.timeout);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      if (timeout) xhr.timeout = timeout;
      if (requestOptions.parseAs === "blob") xhr.responseType = "blob";
      if (requestOptions.parseAs === "arrayBuffer") xhr.responseType = "arraybuffer";

      new Headers(init.headers).forEach((value, key) => xhr.setRequestHeader(key, value));

      const abort = () => {
        xhr.abort();
        reject(new ApiClientError("API request was aborted.", {
          code: "STATEMESH_API_ABORTED",
          metadata: { url, method, aborted: true }
        }));
      };

      requestOptions.signal?.addEventListener("abort", abort, { once: true });

      xhr.upload.onprogress = (event) => {
        const total = event.lengthComputable ? event.total : null;
        const progress: ApiUploadProgress = {
          loaded: event.loaded,
          total,
          percent: total ? Math.round((event.loaded / total) * 100) : null,
          lengthComputable: event.lengthComputable
        };
        requestOptions.onUploadProgress?.(progress);
        options.onEvent?.({
          type: "api.upload.progress",
          url,
          method,
          loaded: progress.loaded,
          total: progress.total,
          percent: progress.percent,
          timestamp: Date.now(),
          metadata: requestOptions.metadata
        });
      };

      xhr.onload = () => {
        requestOptions.signal?.removeEventListener("abort", abort);
        const response = createXhrResponse(xhr);
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new ApiClientError(`API request failed with HTTP ${xhr.status}.`, {
            status: xhr.status,
            response,
            metadata: { url, method, attempt: 1 }
          }));
          return;
        }
        try {
          resolve({ status: xhr.status, data: parseXhrResponse<TResult>(xhr, requestOptions.parseAs) });
        } catch (error) {
          reject(error);
        }
      };

      xhr.onerror = () => {
        requestOptions.signal?.removeEventListener("abort", abort);
        reject(new ApiClientError("API request failed.", {
          code: "STATEMESH_API_CLIENT_ERROR",
          metadata: { url, method, attempt: 1 }
        }));
      };

      xhr.ontimeout = () => {
        requestOptions.signal?.removeEventListener("abort", abort);
        options.onEvent?.({
          type: "api.request.timeout",
          url,
          method,
          timeout: timeout ?? 0,
          timestamp: Date.now(),
          metadata: requestOptions.metadata
        });
        reject(new ApiClientError("API request timed out.", {
          code: "STATEMESH_API_TIMEOUT",
          metadata: { url, method, timeout }
        }));
      };

      xhr.send(init.body as XMLHttpRequestBodyInit | null | undefined);
    });
  }

  return {
    request,
    get: (path, requestOptions) => request(path, { ...requestOptions, method: "GET" }),
    post: (path, body, requestOptions) => request(path, { ...requestOptions, method: "POST", body }),
    put: (path, body, requestOptions) => request(path, { ...requestOptions, method: "PUT", body }),
    patch: (path, body, requestOptions) => request(path, { ...requestOptions, method: "PATCH", body }),
    delete: (path, requestOptions) => request(path, { ...requestOptions, method: "DELETE" }),
    upload
  };
}

async function resolveHeaders(headers?: HeadersInit | (() => MaybePromise<HeadersInit>)): Promise<HeadersInit | undefined> {
  return typeof headers === "function" ? headers() : headers;
}

function mergeHeaders(target: Headers, source?: HeadersInit): void {
  if (!source) return;
  new Headers(source).forEach((value, key) => target.set(key, value));
}

function buildUrl(baseUrl: string | undefined, path: string, query?: ApiRequestOptions["query"]): string {
  const pathIsAbsolute = isAbsoluteUrl(path);
  const url = pathIsAbsolute
    ? new URL(path)
    : baseUrl
      ? new URL(path.replace(/^\/+/, ""), new URL(ensureTrailingSlash(baseUrl), getUrlOrigin()))
      : new URL(path, getUrlOrigin());

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  if (!pathIsAbsolute && (!baseUrl || !isAbsoluteUrl(baseUrl))) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return url.toString();
}

function getUrlOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "http://statemesh.local";
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value);
}

async function parseResponse<TResult>(response: Response, parseAs?: ApiParseMode): Promise<TResult> {
  if (parseAs === "response") return response as TResult;
  if (parseAs === "void" || response.status === 204) return undefined as TResult;
  if (parseAs === "blob") return response.blob() as Promise<TResult>;
  if (parseAs === "arrayBuffer") return response.arrayBuffer() as Promise<TResult>;
  if (parseAs === "text") return response.text() as Promise<TResult>;

  const contentType = response.headers.get("Content-Type") ?? "";
  if (parseAs === "json" || contentType.includes("application/json")) {
    return response.json() as Promise<TResult>;
  }

  return response.text() as Promise<TResult>;
}

function parseXhrResponse<TResult>(xhr: XMLHttpRequest, parseAs?: ApiParseMode): TResult {
  if (parseAs === "response") return createXhrResponse(xhr) as TResult;
  if (parseAs === "void" || xhr.status === 204) return undefined as TResult;
  if (parseAs === "blob" || parseAs === "arrayBuffer") return xhr.response as TResult;
  if (parseAs === "text") return xhr.responseText as TResult;

  const contentType = xhr.getResponseHeader("Content-Type") ?? "";
  if (parseAs === "json" || contentType.includes("application/json")) {
    return JSON.parse(xhr.responseText || "null") as TResult;
  }

  return xhr.responseText as TResult;
}

function createXhrResponse(xhr: XMLHttpRequest): Response {
  return new Response(xhr.response ?? xhr.responseText, {
    status: xhr.status,
    statusText: xhr.statusText,
    headers: parseXhrHeaders(xhr.getAllResponseHeaders())
  });
}

function parseXhrHeaders(rawHeaders: string): Headers {
  const headers = new Headers();
  for (const line of rawHeaders.trim().split(/[\r\n]+/)) {
    if (!line) continue;
    const index = line.indexOf(":");
    if (index <= 0) continue;
    headers.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  return headers;
}

function resolveTimeout(requestTimeout: number | false | undefined, globalTimeout: number | undefined): number | null {
  if (requestTimeout === false) return null;
  return requestTimeout ?? globalTimeout ?? null;
}

function resolveRetryOptions(requestRetry: number | false | ApiRetryOptions | undefined, globalRetry: number | false | ApiRetryOptions | undefined): ResolvedRetryOptions {
  const retry = requestRetry ?? globalRetry;
  if (retry === false || retry === undefined) {
    return { attempts: 0, retryNetworkErrors: true, retryTimeouts: false };
  }
  if (typeof retry === "number") {
    return { attempts: Math.max(0, retry), retryNetworkErrors: true, retryTimeouts: false };
  }
  return {
    attempts: Math.max(0, retry.attempts ?? 0),
    delay: retry.delay,
    retryOn: retry.retryOn,
    retryNetworkErrors: retry.retryNetworkErrors ?? true,
    retryTimeouts: retry.retryTimeouts ?? false,
    jitter: retry.jitter
  };
}

function shouldRetry(retryOptions: ResolvedRetryOptions, context: ApiRetryContext): boolean {
  if (context.attempt > retryOptions.attempts) return false;

  const error = context.error;
  if (error instanceof ApiClientError && error.code === "STATEMESH_API_TIMEOUT") {
    return retryOptions.retryTimeouts;
  }
  if (error instanceof ApiClientError && error.code === "STATEMESH_API_ABORTED") {
    return false;
  }

  if (context.status !== undefined) {
    if (typeof retryOptions.retryOn === "function") return retryOptions.retryOn(context);
    return (retryOptions.retryOn ?? DEFAULT_RETRY_STATUSES).includes(context.status);
  }

  return retryOptions.retryNetworkErrors;
}

function getRetryDelay(retryOptions: ResolvedRetryOptions, context: ApiRetryContext): number {
  const baseDelay = typeof retryOptions.delay === "function"
    ? retryOptions.delay(context)
    : retryOptions.delay ?? Math.min(1000 * 2 ** (context.attempt - 1), 30_000);
  return Math.max(0, applyJitter(baseDelay, retryOptions.jitter, context));
}

function applyJitter(delayMs: number, jitter: ApiRetryOptions["jitter"], context: ApiRetryContext): number {
  if (!jitter) return delayMs;
  if (typeof jitter === "function") return jitter(delayMs, context);
  if (jitter === true) return Math.random() * delayMs;
  return delayMs + (Math.random() * 2 - 1) * delayMs * jitter;
}

function mergeAbortSignals(first?: AbortSignal, second?: AbortSignal): AbortSignal | undefined {
  if (!first) return second;
  if (!second) return first;

  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };

  if (first.aborted) abort(first);
  else first.addEventListener("abort", () => abort(first), { once: true });

  if (second.aborted) abort(second);
  else second.addEventListener("abort", () => abort(second), { once: true });

  return controller.signal;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError" ||
    Boolean(error && typeof error === "object" && "name" in error && (error as { name?: unknown }).name === "AbortError")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    (typeof ReadableStream !== "undefined" && value instanceof ReadableStream)
  );
}
