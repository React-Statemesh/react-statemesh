import type { MeshEvent, MeshPlugin } from "../core/types";
import { setPath } from "../utils";
import { createTimeline } from "./timeline";
import { formatEvent } from "./eventFormatter";

/** Options for the StateMesh logger plugin. */
export type LoggerPluginOptions = {
  /** Enable logging. Defaults to true only in development. */
  enabled?: boolean;
  /** Metadata paths to mask before logging. */
  mask?: readonly string[];
  /** Number of events retained in the internal timeline. */
  limit?: number;
  /** Custom log sink. Defaults to `console.debug`. */
  sink?: (label: string, event: MeshEvent) => void;
};

/**
 * Create a production-safe logger plugin.
 *
 * The logger is disabled by default outside development and can mask sensitive metadata paths.
 *
 * @example
 * ```ts
 * mesh.use(loggerPlugin({
 *   enabled: process.env.NODE_ENV === "development",
 *   mask: ["user.email", "auth.token"]
 * }));
 * ```
 */
export function loggerPlugin<TState>(options: LoggerPluginOptions = {}): MeshPlugin<TState> {
  const enabled = options.enabled ?? process.env.NODE_ENV === "development";
  const timeline = createTimeline(options.limit ?? 200);

  return {
    name: "logger",
    setup({ onEvent }) {
      if (!enabled) return;
      return onEvent((event) => {
        const masked = maskEvent(event, options.mask ?? []);
        timeline.add(masked);
        const label = formatEvent(masked);
        if (options.sink) {
          options.sink(label, masked);
        } else if (typeof console !== "undefined") {
          console.debug(`[StateMesh] ${label}`, masked);
        }
      });
    }
  };
}

/** Return a copy of an event with selected metadata paths replaced by `"[masked]"`. */
export function maskEvent(event: MeshEvent, paths: readonly string[]): MeshEvent {
  if (!paths.length || !("metadata" in event) || !event.metadata) return event;
  let metadata = event.metadata;
  for (const path of paths) {
    metadata = setPath(metadata, path, "[masked]");
  }
  return { ...event, metadata };
}
