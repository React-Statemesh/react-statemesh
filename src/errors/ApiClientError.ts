import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown by the built-in API client when an HTTP request fails. */
export class ApiClientError extends StateMeshError {
  readonly status: number;
  readonly response: Response | null;

  constructor(message: string, options: Partial<StateMeshErrorOptions> & { status?: number; response?: Response | null } = {}) {
    super(message, { code: "STATEMESH_API_CLIENT_ERROR", ...options });
    this.name = "ApiClientError";
    this.status = options.status ?? 0;
    this.response = options.response ?? null;
  }
}
