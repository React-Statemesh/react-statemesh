import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when a registered mutation fails. */
export class MutationError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_MUTATION_ERROR", ...options });
    this.name = "MutationError";
  }
}
