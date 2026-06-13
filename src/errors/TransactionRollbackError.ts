import { StateMeshError, type StateMeshErrorOptions } from "./StateMeshError";

/** Thrown when transaction rollback itself fails. */
export class TransactionRollbackError extends StateMeshError {
  constructor(message: string, options: Partial<StateMeshErrorOptions> = {}) {
    super(message, { code: "STATEMESH_TRANSACTION_ROLLBACK_ERROR", ...options });
    this.name = "TransactionRollbackError";
  }
}
