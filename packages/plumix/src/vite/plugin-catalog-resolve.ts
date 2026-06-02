import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

/**
 * Find the absolute path of a plugin's installed package root, used by
 * the bundler to resolve `i18n.catalogPath` against the plugin's own
 * directory (not the consumer's `projectRoot`).
 *
 * Tries known npm-name conventions in order — `@plumix/plugin-<id>`
 * for first-party plugins, `plumix-plugin-<id>` for community plugins.
 * Returns `null` if no convention resolves. `requireFrom` is a test
 * seam; production passes `createRequire` from `node:module`.
 */
export function findPluginPackageRoot(input: {
  readonly pluginId: string;
  readonly projectRoot: string;
  readonly requireFrom?: (filename: string) => {
    readonly resolve: (id: string) => string;
  };
}): string | null {
  const { pluginId, projectRoot } = input;
  const requireFrom = input.requireFrom ?? createRequire;
  const require = requireFrom(resolve(projectRoot, "package.json"));
  // First-party scope first; community plugins follow the unscoped
  // `plumix-plugin-<id>` convention. Anything else needs to declare
  // its own resolution path, out of scope for this slice.
  const candidates = [
    `@plumix/plugin-${pluginId}`,
    `plumix-plugin-${pluginId}`,
  ];
  for (const name of candidates) {
    try {
      return dirname(require.resolve(`${name}/package.json`));
    } catch {
      continue;
    }
  }
  return null;
}
