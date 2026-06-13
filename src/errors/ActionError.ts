import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when a named action is missing or its handler fails. */
export class ActionError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_ACTION_ERROR", ...options });
    this.name = "ActionError";
  }
}
