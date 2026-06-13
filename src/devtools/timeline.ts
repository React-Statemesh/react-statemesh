import type { MeshEvent } from "../core/types";

/** A StateMesh event with its timeline index. */
export type TimelineEntry = MeshEvent & {
  index: number;
};

/** Create an in-memory event timeline with a maximum number of retained entries. */
export function createTimeline(limit = 200) {
  const entries: TimelineEntry[] = [];

  return {
    add(event: MeshEvent): TimelineEntry {
      const entry = { ...event, index: entries.length };
      entries.push(entry);
      if (entries.length > limit) entries.shift();
      return entry;
    },
    entries: () => [...entries],
    clear: () => {
      entries.length = 0;
    }
  };
}
