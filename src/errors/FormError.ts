import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when form registration, validation, or submit flow fails. */
export class FormError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_FORM_ERROR", ...options });
    this.name = "FormError";
  }
}
