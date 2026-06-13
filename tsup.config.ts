import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "persist/index": "src/persist/index.ts",
    "sync/index": "src/sync/index.ts",
    "resources/index": "src/resources/index.ts",
    "devtools/index": "src/devtools/index.ts",
    "testing/index": "src/testing/index.ts"
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ["react", "react/jsx-runtime"]
});
