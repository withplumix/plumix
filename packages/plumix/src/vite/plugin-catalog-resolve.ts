import { lstatSync } from "node:fs";
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

/**
 * Detect whether a plugin is loaded via a pnpm workspace symlink — i.e.,
 * `node_modules/@plumix/plugin-<id>` is itself a symlink to a sibling
 * monorepo package. Used by the manifest layer to skip URL emission
 * for plugins admin already bakes into its bundle via
 * `import.meta.glob("../../../plugins/*"/locales/*.mjs")`.
 *
 * Intentionally scoped to the `@plumix/plugin-<id>` convention only —
 * admin's glob covers `packages/plugins/*` in the plumix monorepo,
 * which by convention houses `@plumix/`-scoped plugins. Workspace
 * plugins under a different convention (`plumix-plugin-<id>`,
 * community forks) aren't covered by admin's glob either, so emitting
 * a URL for them is correct.
 *
 * Inspects the symlink at `node_modules/@plumix/plugin-<id>` directly
 * with `lstat` — `require.resolve` would follow the symlink and yield
 * the realpath, defeating the check. `lstat` on the path itself
 * reports `isSymbolicLink()` for the dir-entry, ignoring symlinked
 * ancestors (macOS tmpdir).
 */
export function isWorkspaceSymlinkedPlugin(input: {
  readonly pluginId: string;
  readonly projectRoot: string;
}): boolean {
  const symlinkPath = resolve(
    input.projectRoot,
    "node_modules",
    "@plumix",
    `plugin-${input.pluginId}`,
  );
  try {
    return lstatSync(symlinkPath).isSymbolicLink();
  } catch {
    return false;
  }
}
