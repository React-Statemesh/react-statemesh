import { createContext, useContext, useEffect, useId, useMemo, type ReactNode } from "react";
import type { MeshDevtoolsComponentUsage } from "../core/types";
import { useMesh } from "./useMesh";

const MeshComponentContext = createContext<string | null>(null);

/** Props for a tracked DevTools component boundary. */
export type MeshComponentProps = {
  /** Human-readable component name shown in StateMesh DevTools. */
  name: string;
  /** Optional stable id when you want to correlate the same component across reloads. */
  id?: string;
  /** Override the tracked parent id. Defaults to the nearest tracked parent. */
  parentId?: string | null;
  children: ReactNode;
};

/** Register a visible StateMesh-aware component boundary for DevTools. */
export function MeshComponent({ name, id, parentId, children }: MeshComponentProps) {
  const componentId = useMeshComponent(name, { id, parentId });
  const contextValue = useMemo(() => componentId, [componentId]);
  return <MeshComponentContext.Provider value={contextValue}>{children}</MeshComponentContext.Provider>;
}

/** Register the current component instance for the StateMesh DevTools component tree. */
export function useMeshComponent(
  name: string,
  options: { id?: string; parentId?: string | null } = {}
): string {
  const mesh = useMesh();
  const generatedId = useId();
  const inheritedParentId = useContext(MeshComponentContext);
  const componentId = options.id ?? `mesh-component-${normalizeReactId(generatedId)}`;
  const parentId = options.parentId ?? inheritedParentId;

  useEffect(() => mesh.registerDevtoolsComponent({ id: componentId, name, parentId }));

  return componentId;
}

/** Attach one StateMesh hook/action/resource usage to the nearest tracked component. */
export function useMeshComponentUsage(usage: MeshDevtoolsComponentUsage): void {
  const mesh = useMesh();
  const componentId = useContext(MeshComponentContext);
  const detailsKey = useMemo(() => stringifyUsageDetails(usage.details), [usage.details]);

  useEffect(() => {
    if (!componentId) return;
    mesh.recordDevtoolsComponentUsage(componentId, usage);
  }, [mesh, componentId, usage.kind, usage.name, detailsKey]);
}

function normalizeReactId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

function stringifyUsageDetails(details: Record<string, unknown> | undefined): string {
  if (!details) return "";
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}
