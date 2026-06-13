import { useCallback } from "react";
import type { MeshAction } from "../core/types";
import { useMesh } from "./useMesh";

/**
 * Return a stable function that runs a registered action by name.
 *
 * @example
 * ```tsx
 * const addItem = useMeshAction("cart.addItem");
 * addItem(product);
 * ```
 */
export function useMeshAction<TPayload = void, TResult = void, TState = unknown>(
  nameOrAction: string | MeshAction<TPayload, TResult>
): (payload: TPayload) => TResult {
  const mesh = useMesh<TState>();
  const actionName = typeof nameOrAction === "string" ? nameOrAction : nameOrAction.actionName;
  return useCallback((payload: TPayload) => mesh.runAction<TPayload, TResult>(actionName, payload), [mesh, actionName]);
}
