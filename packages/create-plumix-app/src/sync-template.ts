import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { loadCatalogContext, rewritePackageJsonFile } from "./catalog.js";
import { shouldCopyTemplateEntry } from "./scaffold.js";

interface SyncTemplateOptions {
  /** The workspace example to snapshot (e.g. `examples/minimal`). */
  readonly source: string;
  /** Where the self-contained snapshot is written. */
  readonly dest: string;
  /** Monorepo root, used to resolve the catalog and package versions. */
  readonly repoRoot: string;
}

/**
 * Snapshot the workspace example into a self-contained template with
 * pnpm's `workspace:`/`catalog:` protocols already resolved to concrete
 * SemVer — the same rewrite pnpm performs at publish. Baking it here, at
 * `prepack`, means the published tarball needs no monorepo context when
 * the scaffolder runs on an end user's machine.
 */
export async function syncTemplate({
  source,
  dest,
  repoRoot,
}: SyncTemplateOptions): Promise<void> {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cp(source, dest, {
    recursive: true,
    filter: (srcPath) => shouldCopyTemplateEntry(srcPath, source),
  });

  const ctx = await loadCatalogContext(repoRoot);
  await rewritePackageJsonFile(join(dest, "package.json"), ctx);
}
