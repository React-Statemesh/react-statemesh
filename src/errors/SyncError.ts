import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when cross-tab sync cannot apply a remote update. */
export class SyncError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_SYNC_ERROR", ...options });
    this.name = "SyncError";
  }
}
