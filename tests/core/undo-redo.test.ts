import { describe, expect, it } from "vitest";
import { createMesh } from "../../src/core/createMesh";

function createUndoMesh(state: Record<string, unknown> = { count: 0, name: "initial" }, maxHistory = 50, paths?: string[]) {
  return createMesh({ state, undo: { maxHistory, ...(paths ? { paths } : {}) } });
}

describe("Undo/Redo", () => {
  describe("basic undo", () => {
    it("restores previous state on undo", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      expect(mesh.getState().count).toBe(1);
      mesh.undo();
      expect(mesh.getState().count).toBe(0);
    });

    it("restores state from multiple changes", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.setPath("count", 3);
      expect(mesh.getState().count).toBe(3);
      mesh.undo();
      expect(mesh.getState().count).toBe(2);
      mesh.undo();
      expect(mesh.getState().count).toBe(1);
      mesh.undo();
      expect(mesh.getState().count).toBe(0);
    });

    it("is no-op when undo stack is empty", () => {
      const mesh = createUndoMesh();
      const before = mesh.getState();
      mesh.undo();
      expect(mesh.getState()).toEqual(before);
    });
  });

  describe("basic redo", () => {
    it("restores next state on redo", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      mesh.undo();
      expect(mesh.getState().count).toBe(0);
      mesh.redo();
      expect(mesh.getState().count).toBe(1);
    });

    it("restores state through multiple redos", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.undo();
      mesh.undo();
      expect(mesh.getState().count).toBe(0);
      mesh.redo();
      expect(mesh.getState().count).toBe(1);
      mesh.redo();
      expect(mesh.getState().count).toBe(2);
    });

    it("is no-op when redo stack is empty", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      const before = mesh.getState();
      mesh.redo();
      expect(mesh.getState()).toEqual(before);
    });
  });

  describe("redo cleared on new change", () => {
    it("clears redo stack when a new state change happens", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.undo();
      expect(mesh.getState().count).toBe(1);
      // New change should clear redo
      mesh.setPath("count", 99);
      expect(mesh.canRedo).toBe(false);
      expect(mesh.redoStackSize).toBe(0);
      mesh.redo(); // Should be no-op
      expect(mesh.getState().count).toBe(99);
    });
  });

  describe("canUndo / canRedo getters", () => {
    it("canUndo is false initially", () => {
      const mesh = createUndoMesh();
      expect(mesh.canUndo).toBe(false);
    });

    it("canUndo is true after a change", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      expect(mesh.canUndo).toBe(true);
    });

    it("canRedo is false initially", () => {
      const mesh = createUndoMesh();
      expect(mesh.canRedo).toBe(false);
    });

    it("canRedo is true after undo", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      mesh.undo();
      expect(mesh.canRedo).toBe(true);
    });

    it("canUndo is false after undoing all changes", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      mesh.undo();
      expect(mesh.canUndo).toBe(false);
    });
  });

  describe("stack size getters", () => {
    it("undoStackSize tracks entries", () => {
      const mesh = createUndoMesh();
      expect(mesh.undoStackSize).toBe(0);
      mesh.setPath("count", 1);
      expect(mesh.undoStackSize).toBe(1);
      mesh.setPath("count", 2);
      expect(mesh.undoStackSize).toBe(2);
    });

    it("redoStackSize tracks entries", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.undo();
      expect(mesh.redoStackSize).toBe(1);
      mesh.undo();
      expect(mesh.redoStackSize).toBe(2);
    });
  });

  describe("clearUndoHistory", () => {
    it("clears both stacks", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.undo();
      expect(mesh.undoStackSize).toBeGreaterThan(0);
      expect(mesh.redoStackSize).toBeGreaterThan(0);
      mesh.clearUndoHistory();
      expect(mesh.undoStackSize).toBe(0);
      expect(mesh.redoStackSize).toBe(0);
      expect(mesh.canUndo).toBe(false);
      expect(mesh.canRedo).toBe(false);
    });
  });

  describe("maxHistory bounds the stack", () => {
    it("evicts oldest entries when maxHistory is exceeded", () => {
      const mesh = createUndoMesh({ count: 0 }, 3);
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.setPath("count", 3);
      mesh.setPath("count", 4);
      // Only 3 entries retained (maxHistory=3)
      expect(mesh.undoStackSize).toBe(3);
      // Oldest entry (count=0→1) was evicted, so first undo goes to count=3
      mesh.undo();
      expect(mesh.getState().count).toBe(3);
    });
  });

  describe("path-filtered undo", () => {
    it("only restores tracked paths", () => {
      const mesh = createUndoMesh({ count: 0, name: "initial" }, 50, ["count"]);
      mesh.setPath("count", 1);
      mesh.setPath("name", "changed");
      expect(mesh.getState().count).toBe(1);
      expect(mesh.getState().name).toBe("changed");
      // Undo the name change — restores count to 1 (state before name change)
      // because only "count" is tracked, and at that point count was 1
      mesh.undo();
      expect(mesh.getState().count).toBe(1);
      expect(mesh.getState().name).toBe("changed"); // name not tracked, unchanged
      // Undo the count change — restores count to 0
      mesh.undo();
      expect(mesh.getState().count).toBe(0);
      expect(mesh.getState().name).toBe("changed"); // name still not affected
    });

    it("redo restores tracked paths", () => {
      const mesh = createUndoMesh({ count: 0, name: "initial" }, 50, ["count"]);
      mesh.setPath("count", 1);
      mesh.undo();
      expect(mesh.getState().count).toBe(0);
      mesh.redo();
      expect(mesh.getState().count).toBe(1);
    });
  });

  describe("undo events", () => {
    it("emits state.changed with phase undo", () => {
      const mesh = createUndoMesh();
      const events: string[] = [];
      mesh.onEvent((event) => {
        if (event.type === "state.changed" && event.metadata?.phase === "undo") {
          events.push("undo");
        }
      });
      mesh.setPath("count", 1);
      mesh.undo();
      expect(events).toEqual(["undo"]);
    });

    it("emits state.changed with phase redo", () => {
      const mesh = createUndoMesh();
      const events: string[] = [];
      mesh.onEvent((event) => {
        if (event.type === "state.changed" && event.metadata?.phase === "redo") {
          events.push("redo");
        }
      });
      mesh.setPath("count", 1);
      mesh.undo();
      mesh.redo();
      expect(events).toEqual(["redo"]);
    });
  });

  describe("subscriber notification", () => {
    it("notifies subscribers on undo", () => {
      const mesh = createUndoMesh();
      const values: number[] = [];
      mesh.subscribe("count", (val) => { values.push(val as number); });
      mesh.setPath("count", 1);
      mesh.undo();
      expect(values).toEqual([1, 0]);
    });

    it("notifies subscribers on redo", () => {
      const mesh = createUndoMesh();
      const values: number[] = [];
      mesh.subscribe("count", (val) => { values.push(val as number); });
      mesh.setPath("count", 1);
      mesh.undo();
      mesh.redo();
      expect(values).toEqual([1, 0, 1]);
    });
  });

  describe("undo with batch", () => {
    it("undoes batched changes as one entry", () => {
      const mesh = createUndoMesh();
      mesh.batch(() => {
        mesh.setPath("count", 1);
        mesh.setPath("name", "batched");
      });
      expect(mesh.getState().count).toBe(1);
      expect(mesh.getState().name).toBe("batched");
      // One undo should restore both
      expect(mesh.undoStackSize).toBe(1);
      mesh.undo();
      expect(mesh.getState().count).toBe(0);
      expect(mesh.getState().name).toBe("initial");
    });
  });

  describe("undo after reset", () => {
    it("can undo back to pre-reset state", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 5);
      mesh.reset();
      expect(mesh.getState().count).toBe(0);
      mesh.undo();
      expect(mesh.getState().count).toBe(5);
    });
  });

  describe("error when undo not enabled", () => {
    it("throws when undo options not provided", () => {
      const mesh = createMesh({ state: { count: 0 } });
      expect(() => mesh.undo()).toThrow("Undo is not enabled");
      expect(() => mesh.redo()).toThrow("Redo is not enabled");
    });
  });

  describe("complex undo/redo sequences", () => {
    it("handles undo → redo → undo → new change → undo", () => {
      const mesh = createUndoMesh();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.undo(); // count=1
      mesh.redo(); // count=2
      mesh.undo(); // count=1
      mesh.setPath("count", 10); // new change, clears redo
      expect(mesh.canRedo).toBe(false);
      mesh.undo(); // count=1
      expect(mesh.getState().count).toBe(1);
    });

    it("preserves full state across undo/redo", () => {
      const mesh = createUndoMesh({ count: 0, name: "a", flag: true });
      mesh.setState({ count: 1, name: "b", flag: false });
      mesh.undo();
      const state = mesh.getState();
      expect(state.count).toBe(0);
      expect(state.name).toBe("a");
      expect(state.flag).toBe(true);
    });
  });
});
