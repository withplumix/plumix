import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ScaffoldSources } from "./snapshot.js";
import { buildSnapshot, loadSnapshot } from "./snapshot.js";

export type { ScaffoldSources };

export function loadSources(
  repoRoot: string,
  snapshotPath: string,
): Promise<ScaffoldSources> {
  // A plumix-specific marker: a user installing the CLI inside their own pnpm
  // workspace must still get the baked snapshot.
  const inPlumixWorkspace =
    existsSync(join(repoRoot, "pnpm-workspace.yaml")) &&
    existsSync(join(repoRoot, "packages", "runtimes"));
  return inPlumixWorkspace
    ? buildSnapshot(repoRoot)
    : loadSnapshot(snapshotPath);
}
