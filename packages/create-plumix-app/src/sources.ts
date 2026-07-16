import { existsSync } from "node:fs";
import { join } from "node:path";

import type { CatalogContext } from "./catalog.js";
import type { Registry } from "./registry.js";
import { buildSnapshot, loadSnapshot } from "./snapshot.js";

export interface ScaffoldSources {
  readonly registry: Registry;
  readonly ctx: CatalogContext;
}

/**
 * Resolve the registry and catalog context for a scaffold run. Inside the
 * plumix monorepo they come from the live workspace; a published install
 * has no monorepo and reads the snapshot baked at `prepack`. Both paths
 * produce the same `Snapshot`, so scaffolded output is identical either way.
 */
export async function loadSources(
  repoRoot: string,
  snapshotPath: string,
): Promise<ScaffoldSources> {
  // Require a plumix-specific marker, not just any pnpm-workspace.yaml: a
  // user flat-installing the CLI inside their own pnpm workspace must still
  // fall back to the baked snapshot, not try to scan their `packages/`.
  const inPlumixWorkspace =
    existsSync(join(repoRoot, "pnpm-workspace.yaml")) &&
    existsSync(join(repoRoot, "packages", "runtimes"));
  const { registry, catalogContext } = inPlumixWorkspace
    ? await buildSnapshot(repoRoot)
    : await loadSnapshot(snapshotPath);
  return { registry, ctx: catalogContext };
}
