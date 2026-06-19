import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { TransactionHandle, TransactionStatus } from "../core/types";
import { shallowEqual } from "../utils";
import { useMeshComponentUsage } from "./componentTracking";
import { useMesh } from "./useMesh";

/**
 * Subscribe to a registered transaction and return its status plus controls.
 *
 * The returned handle includes `run`, `retry`, `cancel`, `reset`, `pending`, `error`, `data`,
 * timestamps, duration, and attempt count.
 *
 * @example
 * ```tsx
 * const checkout = useMeshTransaction("cart.checkout");
 *
 * return (
 *   <button disabled={checkout.pending} onClick={() => checkout.run({ paymentMethodId: "card_1" })}>
 *     {checkout.pending ? "Processing..." : "Pay now"}
 *   </button>
 * );
 * ```
 */
export function useMeshTransaction<TPayload = void, TResult = unknown, TState = unknown>(
  nameOrTransaction: string | TransactionHandle<TPayload, TResult>
): TransactionHandle<TPayload, TResult> {
  const mesh = useMesh<TState>();
  const transactionName = typeof nameOrTransaction === "string" ? nameOrTransaction : nameOrTransaction.transactionName;
  useMeshComponentUsage({ kind: "transaction", name: transactionName });
  const lastStatusRef = useRef<TransactionStatus<TResult> | null>(null);

  const subscribe = useCallback((listener: () => void) => mesh.subscribeTransaction(transactionName, listener), [mesh, transactionName]);
  const getSnapshot = useCallback(() => {
    const next = mesh.getTransactionStatus<TResult>(transactionName);
    const previous = lastStatusRef.current;
    if (previous && shallowEqual(previous, next)) return previous;
    lastStatusRef.current = next;
    return next;
  }, [mesh, transactionName]);

  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      ...status,
      transactionName,
      kind: "statemesh.transaction" as const,
      run: (payload: TPayload) => mesh.runTransaction<TPayload, TResult>(transactionName, payload),
      retry: () => mesh.retryTransaction<TResult>(transactionName),
      cancel: () => mesh.cancelTransaction(transactionName),
      reset: () => mesh.resetTransaction(transactionName)
    }),
    [mesh, transactionName, status]
  );
}
