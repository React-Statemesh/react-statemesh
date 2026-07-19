import { describe, expect, it, vi } from "vitest";
import { createMesh } from "../../src/core/createMesh";

describe("Middleware Pipelines", () => {
  describe("registration", () => {
    it("registers a pipeline with stages", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const unsub = mesh.pipeline("test", [
        { name: "a", handler: (_ctx, next) => next() }
      ]);
      expect(typeof unsub).toBe("function");
      unsub();
    });

    it("throws DuplicateRegistrationError on duplicate name", () => {
      const mesh = createMesh({ state: { count: 0 } });
      mesh.pipeline("test", [
        { name: "a", handler: (_ctx, next) => next() }
      ]);
      expect(() => {
        mesh.pipeline("test", [
          { name: "b", handler: (_ctx, next) => next() }
        ]);
      }).toThrow("already registered");
    });

    it("unsubscribe removes the pipeline", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const calls: string[] = [];
      const unsub = mesh.pipeline("test", [
        { name: "a", handler: (_ctx, next) => { calls.push("a"); return next(); } }
      ]);
      mesh.setPath("count", 1);
      expect(calls).toEqual(["a"]);
      unsub();
      mesh.setPath("count", 2);
      expect(calls).toEqual(["a"]); // No new call
    });

    it("removePipeline removes the pipeline", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const calls: string[] = [];
      mesh.pipeline("test", [
        { name: "a", handler: (_ctx, next) => { calls.push("a"); return next(); } }
      ]);
      const removed = mesh.removePipeline("test");
      expect(removed).toBe(true);
      mesh.setPath("count", 1);
      expect(calls).toEqual([]);
    });

    it("removePipeline returns false for unknown pipeline", () => {
      const mesh = createMesh({ state: { count: 0 } });
      expect(mesh.removePipeline("nonexistent")).toBe(false);
    });
  });

  describe("stage execution order", () => {
    it("executes stages in registration order", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const calls: string[] = [];
      mesh.pipeline("test", [
        { name: "first", handler: (_ctx, next) => { calls.push("first"); return next(); } },
        { name: "second", handler: (_ctx, next) => { calls.push("second"); return next(); } },
        { name: "third", handler: (_ctx, next) => { calls.push("third"); return next(); } }
      ]);
      mesh.setPath("count", 1);
      expect(calls).toEqual(["first", "second", "third"]);
    });
  });

  describe("short-circuit", () => {
    it("not calling next() stops the pipeline", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const calls: string[] = [];
      mesh.pipeline("test", [
        { name: "first", handler: () => { calls.push("first"); } }, // No next() call
        { name: "second", handler: (_ctx, next) => { calls.push("second"); return next(); } }
      ]);
      mesh.setPath("count", 1);
      expect(calls).toEqual(["first"]);
    });
  });

  describe("context", () => {
    it("ctx.event is the current event", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const eventTypes: string[] = [];
      mesh.pipeline("test", [
        {
          name: "observer",
          handler: (ctx, next) => {
            eventTypes.push(ctx.event.type);
            return next();
          }
        }
      ]);
      mesh.setPath("count", 1);
      expect(eventTypes).toContain("state.changed");
    });

    it("ctx.state is current state", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const counts: number[] = [];
      mesh.pipeline("test", [
        {
          name: "reader",
          handler: (ctx, next) => {
            counts.push((ctx.state as { count: number }).count);
            return next();
          }
        }
      ]);
      mesh.setPath("count", 1);
      expect(counts).toEqual([1]); // State is already updated when pipeline runs
    });

    it("ctx.stageIndex and ctx.stageName are correct", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const info: Array<{ index: number; name: string }> = [];
      mesh.pipeline("test", [
        { name: "alpha", handler: (ctx, next) => { info.push({ index: ctx.stageIndex, name: ctx.stageName }); return next(); } },
        { name: "beta", handler: (ctx, next) => { info.push({ index: ctx.stageIndex, name: ctx.stageName }); return next(); } }
      ]);
      mesh.setPath("count", 1);
      expect(info).toEqual([
        { index: 0, name: "alpha" },
        { index: 1, name: "beta" }
      ]);
    });

    it("ctx.mesh is the mesh instance", () => {
      const mesh = createMesh({ state: { count: 0 } });
      let meshRef: unknown = null;
      mesh.pipeline("test", [
        {
          name: "capture",
          handler: (ctx, next) => {
            meshRef = ctx.mesh;
            return next();
          }
        }
      ]);
      mesh.setPath("count", 1);
      expect(meshRef).toBe(mesh);
    });
  });

  describe("error isolation", () => {
    it("pipeline errors do not break state mutations", () => {
      const mesh = createMesh({ state: { count: 0 } });
      mesh.pipeline("test", [
        {
          name: "thrower",
          handler: () => {
            throw new Error("pipeline error");
          }
        }
      ]);
      // State mutation should still work
      mesh.setPath("count", 1);
      expect(mesh.getState().count).toBe(1);
    });
  });

  describe("filter", () => {
    it("filter.type matches exact event type", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const calls: string[] = [];
      mesh.pipeline("test", [
        { name: "a", handler: (_ctx, next) => { calls.push("a"); return next(); } }
      ], { filter: { type: "state.reset" } });
      mesh.setPath("count", 1); // state.changed — should not match
      expect(calls).toEqual([]);
      mesh.reset(); // state.reset — should match
      expect(calls).toEqual(["a"]);
    });

    it("filter.type with wildcard matches prefix", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const calls: string[] = [];
      mesh.pipeline("test", [
        { name: "a", handler: (_ctx, next) => { calls.push("a"); return next(); } }
      ], { filter: { type: "state.*" } });
      mesh.setPath("count", 1); // state.changed — matches state.*
      expect(calls).toEqual(["a"]);
    });

    it("filter.type with RegExp matches", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const calls: string[] = [];
      mesh.pipeline("test", [
        { name: "a", handler: (_ctx, next) => { calls.push("a"); return next(); } }
      ], { filter: { type: /^state\./ } });
      mesh.setPath("count", 1);
      expect(calls).toEqual(["a"]);
    });
  });

  describe("phase", () => {
    it("phase: before runs before existing middleware", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const order: string[] = [];
      mesh.pipeline("test", [
        { name: "pipeline-stage", handler: (_ctx, next) => { order.push("pipeline"); return next(); } }
      ], { phase: "before" });
      mesh.middleware((_event) => { order.push("middleware"); });
      mesh.setPath("count", 1);
      expect(order).toEqual(["pipeline", "middleware"]);
    });

    it("phase: after runs after existing middleware", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const order: string[] = [];
      mesh.pipeline("test", [
        { name: "pipeline-stage", handler: (_ctx, next) => { order.push("pipeline"); return next(); } }
      ], { phase: "after" });
      mesh.middleware((_event) => { order.push("middleware"); });
      mesh.setPath("count", 1);
      expect(order).toEqual(["middleware", "pipeline"]);
    });
  });

  describe("multiple pipelines", () => {
    it("executes multiple pipelines in registration order", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const calls: string[] = [];
      mesh.pipeline("first", [
        { name: "a", handler: (_ctx, next) => { calls.push("first"); return next(); } }
      ]);
      mesh.pipeline("second", [
        { name: "b", handler: (_ctx, next) => { calls.push("second"); return next(); } }
      ]);
      mesh.setPath("count", 1);
      expect(calls).toEqual(["first", "second"]);
    });
  });

  describe("async stages", () => {
    it("supports async handlers", async () => {
      const mesh = createMesh({ state: { count: 0 } });
      const calls: string[] = [];
      mesh.pipeline("test", [
        {
          name: "async-stage",
          handler: async (_ctx, next) => {
            await new Promise((r) => setTimeout(r, 10));
            calls.push("async");
            await next();
          }
        }
      ]);
      mesh.setPath("count", 1);
      // Async pipeline runs fire-and-forget, wait a bit
      await new Promise((r) => setTimeout(r, 50));
      expect(calls).toEqual(["async"]);
    });
  });

  describe("pipeline with empty stages", () => {
    it("does nothing with empty stages array", () => {
      const mesh = createMesh({ state: { count: 0 } });
      mesh.pipeline("empty", []);
      mesh.setPath("count", 1);
      expect(mesh.getState().count).toBe(1);
    });
  });

  describe("pipeline receives all event types", () => {
    it("receives state.changed events", () => {
      const mesh = createMesh({ state: { count: 0 } });
      const eventTypes: string[] = [];
      mesh.pipeline("test", [
        { name: "a", handler: (ctx, next) => { eventTypes.push(ctx.event.type); return next(); } }
      ]);
      mesh.setPath("count", 1);
      expect(eventTypes).toContain("state.changed");
    });
  });

  describe("pipeline can access mesh methods", () => {
    it("can read state via ctx.mesh.getState()", () => {
      const mesh = createMesh({ state: { count: 0 } });
      let readCount = -1;
      mesh.pipeline("test", [
        {
          name: "reader",
          handler: (ctx, next) => {
            readCount = (ctx.mesh.getState() as { count: number }).count;
            return next();
          }
        }
      ]);
      mesh.setPath("count", 42);
      expect(readCount).toBe(42);
    });
  });
});
