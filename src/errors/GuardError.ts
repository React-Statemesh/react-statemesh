import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when a StateMesh guard blocks an operation before it runs. */
export class GuardError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_GUARD_BLOCKED", ...options });
    this.name = "GuardError";
  }
}
