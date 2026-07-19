import { ApiClientError } from "./ApiClientError";
import { StateMeshError } from "./StateMeshError";

/** Return true when a value is a StateMesh custom error. */
export function isStateMeshError(error: unknown): error is StateMeshError {
  return error instanceof StateMeshError;
}

/** Return true when a value is an API client error. */
export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

/** Extract a user-facing message from any thrown value. */
export function getErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

/** Extract an HTTP status from an API-like error when available. */
export function getErrorStatus(error: unknown): number | null {
  if (error instanceof ApiClientError) return error.status || null;
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return null;
}

/** Extract StateMesh diagnostic metadata when available. */
export function getErrorMetadata(error: unknown): Record<string, unknown> | null {
  return error instanceof StateMeshError ? error.metadata ?? null : null;
}
