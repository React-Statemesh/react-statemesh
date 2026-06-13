/** Map of target version to migration function. */
export type MigrationMap = Record<number, (state: Record<string, unknown>) => Record<string, unknown>>;

/**
 * Create a version migration function for persisted state.
 *
 * Migrations run in ascending version order for versions greater than the stored version.
 *
 * @example
 * ```ts
 * const migrate = createMigration({
 *   2: (state) => ({ ...state, "cart.items": [] })
 * });
 * ```
 */
export function createMigration(migrations: MigrationMap) {
  return (state: Record<string, unknown>, fromVersion: number): Record<string, unknown> => {
    let next = state;
    const versions = Object.keys(migrations)
      .map(Number)
      .filter((version) => version > fromVersion)
      .sort((a, b) => a - b);

    for (const version of versions) {
      const migration = migrations[version];
      if (migration) next = migration(next);
    }

    return next;
  };
}
