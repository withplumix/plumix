import type { CatalogContext, PackageJson } from "../catalog.js";
import type { Selection } from "./types.js";
import { resolveDeps } from "../catalog.js";

export type { PackageJson };

// Alphabetical so the merged output is deterministic regardless of the
// order base and addon contributions arrive in.
function sortedByKey(deps: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * Assemble the project's `package.json` from the base shell plus the
 * selected runtime's (and, later, plugins') dependency contributions.
 * Names are unioned and sorted, protocols resolved to concrete versions
 * via the catalog, and the package renamed to the project.
 */
export function assemblePackageJson(
  selection: Selection,
  base: PackageJson,
  ctx: CatalogContext,
): string {
  const { projectName, runtime, plugins } = selection;
  const pluginDeps: Record<string, string> = {};
  for (const plugin of plugins) Object.assign(pluginDeps, plugin.deps);
  // Plugin peers first, so the app's own curated base/runtime versions win
  // a collision (a plugin peer must not silently re-pin plumix or react).
  const deps = sortedByKey({
    ...pluginDeps,
    ...base.dependencies,
    ...runtime.deps,
  });
  const devDeps = sortedByKey({ ...base.devDependencies, ...runtime.devDeps });

  const pkg: PackageJson = {
    ...base,
    name: projectName,
    dependencies: resolveDeps(deps, ctx),
    devDependencies: resolveDeps(devDeps, ctx),
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}
