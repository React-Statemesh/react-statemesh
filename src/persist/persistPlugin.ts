import type { MeshPlugin, PersistOptions } from "../core/types";

/**
 * Create a persistence plugin from `PersistOptions`.
 *
 * This is equivalent to calling `mesh.persist(options)`, but fits the plugin setup style.
 *
 * @example
 * ```ts
 * mesh.use(persistPlugin({
 *   storage: "localStorage",
 *   keys: ["theme"],
 *   version: 1
 * }));
 * ```
 */
export function persistPlugin<TState>(options: PersistOptions<TState>): MeshPlugin<TState> {
  return {
    name: `persist:${options.key ?? "default"}`,
    setup({ mesh }) {
      return mesh.persist(options);
    }
  };
}
