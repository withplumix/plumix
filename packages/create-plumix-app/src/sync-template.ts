import { cp, mkdir, readdir, rm } from "node:fs/promises";
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

interface SyncAllOptions {
  /** Directory holding the `examples/*` to snapshot. */
  readonly examplesDir: string;
  /** Directory where each `<name>` snapshot is written. */
  readonly templatesDir: string;
  /** Monorepo root, used to resolve the catalog and package versions. */
  readonly repoRoot: string;
}

/**
 * Snapshot every example into a like-named template directory, so the
 * scaffolder can offer each by its example name. Returns the names.
 */
export async function syncAllTemplates({
  examplesDir,
  templatesDir,
  repoRoot,
}: SyncAllOptions): Promise<string[]> {
  const entries = await readdir(examplesDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of names) {
    await syncTemplate({
      source: join(examplesDir, name),
      dest: join(templatesDir, name),
      repoRoot,
    });
  }
  return names;
}
