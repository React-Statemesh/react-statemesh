import { describe, expect, it } from "vitest";
import { createMesh } from "../../src/core/createMesh";

function createTTMesh(maxEntries = 1000) {
  return createMesh({ state: { count: 0, name: "initial" }, timeTravel: { maxEntries } });
}

describe("Time Travel", () => {
  describe("enable/disable", () => {
    it("isTimeTravelEnabled is false initially", () => {
      const mesh = createTTMesh();
      expect(mesh.isTimeTravelEnabled).toBe(false);
    });

    it("enableTimeTravel starts recording", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      expect(mesh.isTimeTravelEnabled).toBe(true);
    });

    it("disableTimeTravel stops recording", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.disableTimeTravel();
      expect(mesh.isTimeTravelEnabled).toBe(false);
    });

    it("throws when timeTravel options not provided", () => {
      const mesh = createMesh({ state: { count: 0 } });
      expect(() => mesh.enableTimeTravel()).toThrow("Time travel is not enabled");
    });
  });

  describe("recording", () => {
    it("records state changes when enabled", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      const log = mesh.getTimeTravelLog();
      expect(log).toHaveLength(2);
      expect(log[0].stateBefore.count).toBe(0);
      expect(log[0].stateAfter.count).toBe(1);
      expect(log[1].stateBefore.count).toBe(1);
      expect(log[1].stateAfter.count).toBe(2);
    });

    it("does not record when disabled", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      mesh.disableTimeTravel();
      mesh.setPath("count", 2);
      const log = mesh.getTimeTravelLog();
      expect(log).toHaveLength(1);
    });

    it("preserves log after disabling", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      mesh.disableTimeTravel();
      expect(mesh.getTimeTravelLog()).toHaveLength(1);
    });

    it("each entry has index, event, stateBefore, stateAfter, timestamp", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      const log = mesh.getTimeTravelLog();
      const entry = log[0];
      expect(entry.index).toBe(0);
      expect(entry.event.type).toBe("state.changed");
      expect(entry.stateBefore).toBeDefined();
      expect(entry.stateAfter).toBeDefined();
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it("increments index for each entry", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.setPath("count", 3);
      const log = mesh.getTimeTravelLog();
      expect(log[0].index).toBe(0);
      expect(log[1].index).toBe(1);
      expect(log[2].index).toBe(2);
    });
  });

  describe("replayTo", () => {
    it("restores state at the given index", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.setPath("count", 3);
      mesh.replayTo(0);
      expect(mesh.getState().count).toBe(1);
    });

    it("restores state at middle index", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.setPath("count", 3);
      mesh.replayTo(1);
      expect(mesh.getState().count).toBe(2);
    });

    it("throws for invalid index", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      expect(() => mesh.replayTo(999)).toThrow("not found");
    });

    it("emits event with phase replay", () => {
      const mesh = createTTMesh();
      const phases: string[] = [];
      mesh.onEvent((event) => {
        if (event.metadata?.phase === "replay") phases.push("replay");
      });
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      mesh.replayTo(0);
      expect(phases).toEqual(["replay"]);
    });
  });

  describe("replayToTimestamp", () => {
    it("restores state at nearest timestamp", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      const ts1 = Date.now();
      mesh.setPath("count", 2);
      const ts2 = Date.now();
      mesh.setPath("count", 3);
      // Replay to the timestamp of the second entry
      mesh.replayToTimestamp(ts1);
      expect(mesh.getState().count).toBe(1);
    });

    it("throws when log is empty", () => {
      const mesh = createTTMesh();
      expect(() => mesh.replayToTimestamp(Date.now())).toThrow("empty");
    });
  });

  describe("ring buffer eviction", () => {
    it("evicts oldest entries at maxEntries", () => {
      const mesh = createTTMesh(3);
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.setPath("count", 3);
      mesh.setPath("count", 4);
      const log = mesh.getTimeTravelLog();
      expect(log).toHaveLength(3);
      // Oldest entry (count=1) was evicted
      expect(log[0].stateAfter.count).toBe(2);
      expect(log[1].stateAfter.count).toBe(3);
      expect(log[2].stateAfter.count).toBe(4);
    });
  });

  describe("clearTimeTravelLog", () => {
    it("empties the log", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      expect(mesh.getTimeTravelLog()).toHaveLength(2);
      mesh.clearTimeTravelLog();
      expect(mesh.getTimeTravelLog()).toHaveLength(0);
    });
  });

  describe("replay does not break undo", () => {
    it("replay does not add to undo stack", () => {
      const mesh = createMesh({
        state: { count: 0 },
        undo: { maxHistory: 50 },
        timeTravel: { maxEntries: 100 }
      });
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      const undoSizeBefore = mesh.undoStackSize;
      mesh.replayTo(0);
      // Replay should not add to undo stack
      expect(mesh.undoStackSize).toBe(undoSizeBefore);
    });
  });

  describe("multiple replays", () => {
    it("can replay to different points", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 1);
      mesh.setPath("count", 2);
      mesh.setPath("count", 3);
      mesh.replayTo(0);
      expect(mesh.getState().count).toBe(1);
      mesh.replayTo(2);
      expect(mesh.getState().count).toBe(3);
      mesh.replayTo(1);
      expect(mesh.getState().count).toBe(2);
    });
  });

  describe("replay after reset", () => {
    it("can replay to pre-reset state", () => {
      const mesh = createTTMesh();
      mesh.enableTimeTravel();
      mesh.setPath("count", 5);
      mesh.reset();
      expect(mesh.getState().count).toBe(0);
      // The log should contain the setPath entry
      const log = mesh.getTimeTravelLog();
      expect(log.length).toBeGreaterThan(0);
      mesh.replayTo(0);
      expect(mesh.getState().count).toBe(5);
    });
  });
});
