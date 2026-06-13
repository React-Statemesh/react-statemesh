/** Options used to create a `StateMeshError`. */
export type StateMeshErrorOptions = {
  /** Stable machine-readable error code. */
  code: string;
  /** Original thrown value or lower-level error. */
  cause?: unknown;
  /** Safe diagnostic metadata. Avoid placing secrets here. */
  metadata?: Record<string, unknown>;
};

/**
 * Base error for all StateMesh custom errors.
 *
 * Every StateMesh error includes a stable `code`, optional `cause`, optional `metadata`, and a timestamp.
 */
export class StateMeshError extends Error {
  readonly code: string;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp: number;

  constructor(message: string, options: StateMeshErrorOptions) {
    super(message);
    this.name = "StateMeshError";
    this.code = options.code;
    Object.defineProperty(this, "cause", {
      value: options.cause,
      configurable: true,
      writable: false
    });
    this.metadata = options.metadata;
    this.timestamp = Date.now();
  }
}
