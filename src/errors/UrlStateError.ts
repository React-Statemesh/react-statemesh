import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when URL state is missing or query parsing/serialization fails. */
export class UrlStateError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_URL_STATE_ERROR", ...options });
    this.name = "UrlStateError";
  }
}
