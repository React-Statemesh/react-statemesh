import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when a computed value is missing or its compute function fails. */
export class ComputedError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_COMPUTED_ERROR", ...options });
    this.name = "ComputedError";
  }
}
