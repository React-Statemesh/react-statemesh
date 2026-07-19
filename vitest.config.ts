import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      { find: "react-statemesh/devtools", replacement: fileURLToPath(new URL("./src/devtools/index.ts", import.meta.url)) },
      { find: "react-statemesh/resources", replacement: fileURLToPath(new URL("./src/resources/index.ts", import.meta.url)) },
      { find: "react-statemesh/persist", replacement: fileURLToPath(new URL("./src/persist/index.ts", import.meta.url)) },
      { find: "react-statemesh/sync", replacement: fileURLToPath(new URL("./src/sync/index.ts", import.meta.url)) },
      { find: "react-statemesh/testing", replacement: fileURLToPath(new URL("./src/testing/index.ts", import.meta.url)) },
      { find: "react-statemesh", replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)) }
    ]
  },
  define: {
    "process.env.NODE_ENV": '"development"'
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"]
    }
  }
});
