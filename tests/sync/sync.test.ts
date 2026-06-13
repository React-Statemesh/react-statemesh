import { describe, expect, it } from "vitest";
import { createMesh, tabSyncPlugin } from "../../src";

describe("tab sync", () => {
  it("registers as a plugin and prevents duplicate plugin setup", () => {
    const mesh = createMesh({
      state: {
        theme: "light"
      }
    });

    const plugin = tabSyncPlugin<{ theme: string }>({ keys: ["theme"], channel: "test-channel", sourceTabId: "tab-a" });
    expect(() => mesh.use(plugin)).not.toThrow();
    expect(() => mesh.use(plugin)).toThrow();
  });
});
