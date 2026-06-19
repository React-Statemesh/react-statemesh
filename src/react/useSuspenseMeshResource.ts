import type { ResourceHandle } from "../core/types";
import { useMesh } from "./useMesh";
import {
  useMeshResource,
  type UseMeshResourceOptions,
  type UseMeshResourceResult
} from "./useMeshResource";
import { useMeshErrorResetState } from "./MeshErrorBoundary";

/** Options for `useSuspenseMeshResource`. */
export type UseSuspenseMeshResourceOptions<TParams = void, TData = unknown, TSelected = TData> = Omit<
  UseMeshResourceOptions<TParams, TData, TSelected>,
  "auto" | "enabled" | "placeholderData"
>;

/** Non-null resource result returned after Suspense resolves. */
export type UseSuspenseMeshResourceResult<TParams = void, TData = unknown, TCacheData = TData> = Omit<
  UseMeshResourceResult<TParams, TData, TCacheData>,
  "data" | "pending"
> & {
  /** Resource data is non-null after the Suspense boundary resolves. */
  data: TData;
  /** Suspense handles the initial pending state. */
  pending: false;
};

/**
 * Read a StateMesh resource through React Suspense.
 *
 * The hook throws the shared in-flight resource promise when no cache data exists and throws the
 * cached resource error to the nearest error boundary. Cached data stays visible during background
 * refreshes.
 */
export function useSuspenseMeshResource<TParams = void, TData = unknown, TState = unknown, TSelected = TData>(
  nameOrResource: string | ResourceHandle<TParams, TData>,
  params?: TParams,
  options: UseSuspenseMeshResourceOptions<TParams, TData, TSelected> = {}
): UseSuspenseMeshResourceResult<TParams, TSelected, TData> {
  const mesh = useMesh<TState>();
  const resetState = useMeshErrorResetState();
  const resourceName = typeof nameOrResource === "string" ? nameOrResource : nameOrResource.resourceName;
  const resource = useMeshResource<TParams, TData, TState, TSelected>(nameOrResource, params, {
    ...options,
    auto: false
  });

  if (resource.data === null || resource.data === undefined) {
    if (resource.error) {
      if (!resetState.isReset()) throw resource.error;
      resetState.clearReset();
      throw mesh.fetchResource<TParams, TData>(resourceName, params, {
        ...options,
        force: true,
        background: false,
        metadata: { ...options.metadata, trigger: "error-boundary-reset" }
      });
    }

    throw mesh.fetchResource<TParams, TData>(resourceName, params, {
      ...options,
      force: false,
      background: false,
      metadata: { ...options.metadata, trigger: "suspense" }
    });
  }

  return {
    ...resource,
    data: resource.data,
    pending: false
  };
}
