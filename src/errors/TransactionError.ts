import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when a transaction lifecycle phase fails, times out, or is cancelled. */
export class TransactionError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_TRANSACTION_ERROR", ...options });
    this.name = "TransactionError";
  }
}
