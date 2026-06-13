/** Create a tiny batching helper used to coalesce notification flushes. */
export function createBatcher(flush: () => void): {
  batch: <T>(fn: () => T) => T;
  schedule: () => void;
} {
  let depth = 0;
  let dirty = false;

  return {
    batch<T>(fn: () => T): T {
      depth += 1;
      try {
        return fn();
      } finally {
        depth -= 1;
        if (depth === 0 && dirty) {
          dirty = false;
          flush();
        }
      }
    },
    schedule() {
      if (depth > 0) {
        dirty = true;
        return;
      }
      flush();
    }
  };
}
