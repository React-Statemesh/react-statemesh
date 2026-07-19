import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { MutationHandle, MutationStatus } from "../core/types";
import { shallowEqual } from "../utils";
import { useMeshComponentUsage } from "./componentTracking";
import { useMesh } from "./useMesh";

/**
 * Subscribe to a mutation and return its status plus a stable `run` function.
 *
 * @example
 * ```tsx
 * const createTodo = useMeshMutation(createTodoMutation);
 * await createTodo.run({ title });
 * ```
 */
export function useMeshMutation<TPayload = void, TResult = unknown, TState = unknown>(
  nameOrMutation: string | MutationHandle<TPayload, TResult>
): MutationHandle<TPayload, TResult> {
  const mesh = useMesh<TState>();
  const mutationName = typeof nameOrMutation === "string" ? nameOrMutation : nameOrMutation.mutationName;
  useMeshComponentUsage({ kind: "mutation", name: mutationName });
  const lastStatusRef = useRef<MutationStatus<TResult> | null>(null);

  const subscribe = useCallback((listener: () => void) => mesh.subscribeMutation(mutationName, listener), [mesh, mutationName]);
  const getSnapshot = useCallback(() => {
    const next = mesh.getMutationStatus<TResult>(mutationName);
    const previous = lastStatusRef.current;
    if (previous && shallowEqual(previous, next)) return previous;
    lastStatusRef.current = next;
    return next;
  }, [mesh, mutationName]);

  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      ...status,
      mutationName,
      kind: "statemesh.mutation" as const,
      run: (payload: TPayload) => mesh.runMutation<TPayload, TResult>(mutationName, payload),
      reset: () => mesh.resetMutation(mutationName)
    }),
    [mesh, mutationName, status]
  );
}
