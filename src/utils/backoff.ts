/** Options for the exponential backoff delay calculator. */
export type BackoffOptions = {
  /** Base delay in milliseconds. Defaults to 1000. */
  base?: number;
  /** Maximum delay in milliseconds. Defaults to 30000. */
  max?: number;
  /** Multiplier per attempt. Defaults to 2. */
  factor?: number;
  /** Add randomized jitter when true or when a number (fraction of delay). Defaults to false. */
  jitter?: boolean | number;
};

/**
 * Create an exponential backoff delay function for transaction retries.
 *
 * @example
 * ```ts
 * mesh.transaction("checkout.submit", {
 *   retry: { attempts: 3, delay: backoff() }
 * });
 * ```
 */
export function backoff(options: BackoffOptions = {}): (attempt: number, error: Error) => number {
  const base = options.base ?? 1000;
  const max = options.max ?? 30000;
  const factor = options.factor ?? 2;
  const jitter = options.jitter ?? false;

  return (attempt: number) => {
    const delay = Math.min(base * Math.pow(factor, attempt - 1), max);
    if (!jitter) return delay;
    const fraction = typeof jitter === "number" ? jitter : 1;
    return Math.max(0, delay * (1 - Math.random() * fraction));
  };
}
