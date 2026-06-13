import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when a named action, transaction, computed value, form, URL state, or plugin is registered twice. */
export class DuplicateRegistrationError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_DUPLICATE_REGISTRATION", ...options });
    this.name = "DuplicateRegistrationError";
  }
}
