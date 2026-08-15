import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ScaffoldSources } from "./snapshot.js";
import { buildSnapshot, loadSnapshot } from "./snapshot.js";

export type { ScaffoldSources };

/**
 * Resolve the registry and catalog context for a scaffold run. Inside the
 * plumix monorepo they come from the live workspace; a published install
 * has no monorepo and reads the snapshot baked at `prepack`. Both paths
 * produce the same {@link ScaffoldSources}, so output is identical either way.
 */
export function loadSources(
  repoRoot: string,
  snapshotPath: string,
): Promise<ScaffoldSources> {
  // Require a plumix-specific marker, not just any pnpm-workspace.yaml: a
  // user flat-installing the CLI inside their own pnpm workspace must still
  // fall back to the baked snapshot, not try to scan their `packages/`.
  const inPlumixWorkspace =
    existsSync(join(repoRoot, "pnpm-workspace.yaml")) &&
    existsSync(join(repoRoot, "packages", "runtimes"));
  return inPlumixWorkspace
    ? buildSnapshot(repoRoot)
    : loadSnapshot(snapshotPath);
}
