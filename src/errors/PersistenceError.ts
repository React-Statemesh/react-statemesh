import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown or emitted when persistence restore, migration, serialization, or save fails. */
export class PersistenceError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_PERSISTENCE_ERROR", ...options });
    this.name = "PersistenceError";
  }
}
