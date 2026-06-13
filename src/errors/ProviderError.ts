import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when React hooks are used outside `StateMeshProvider` or provider setup is invalid. */
export class ProviderError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_PROVIDER_ERROR", ...options });
    this.name = "ProviderError";
  }
}
