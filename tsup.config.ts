import { defineConfig } from "tsup";

export default defineConfig([
  // Main bundle — core + react hooks + actions + computed + transactions + forms + url + errors + utils
  // Excludes devtools, testing, persist, sync, resources, router (separate entry points)
  {
    entry: {
      index: "src/index.ts",
      "persist/index": "src/persist/index.ts",
      "sync/index": "src/sync/index.ts",
      "resources/index": "src/resources/index.ts",
      "devtools/index": "src/devtools/index.ts",
      "testing/index": "src/testing/index.ts",
      "router/index": "src/router/index.ts"
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: true,
    treeshake: true,
    minify: false,
    target: "es2020",
    external: ["react", "react/jsx-runtime"],
    outDir: "dist",
    esbuildOptions(options) {
      // Keep function/class names for debugging and mesh.action/mesh.form name inference
      options.keepNames = true;
    },
    onSuccess: "echo Build complete"
  },
  // Minified ESM bundle for production CDN usage
  {
    entry: {
      "index.min": "src/index.ts"
    },
    format: ["esm"],
    dts: false,
    sourcemap: true,
    minify: true,
    splitting: true,
    treeshake: true,
    target: "es2020",
    external: ["react", "react/jsx-runtime"],
    outDir: "dist",
    esbuildOptions(options) {
      options.keepNames = true;
    }
  }
]);
