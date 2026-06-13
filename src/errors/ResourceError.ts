import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when a registered resource fetch, cache write, or invalidation fails. */
export class ResourceError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_RESOURCE_ERROR", ...options });
    this.name = "ResourceError";
  }
}
