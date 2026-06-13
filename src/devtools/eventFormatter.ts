import type { MeshEvent } from "../core/types";

/** Format a StateMesh event into a compact human-readable label. */
export function formatEvent(event: MeshEvent): string {
  switch (event.type) {
    case "state.changed":
      return `state.changed${event.path ? `:${event.path}` : ""}`;
    case "action.started":
    case "action.completed":
    case "action.failed":
    case "transaction.started":
    case "transaction.optimistic":
    case "transaction.effect.started":
    case "transaction.committed":
    case "transaction.rollback":
    case "transaction.cancelled":
    case "transaction.failed":
    case "form.changed":
    case "url.changed":
      return `${event.type}:${event.name}`;
    default:
      return event.type;
  }
}
