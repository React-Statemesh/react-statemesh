import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when a selector fails while reading or notifying selected state. */
export class SelectorError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_SELECTOR_ERROR", ...options });
    this.name = "SelectorError";
  }
}
