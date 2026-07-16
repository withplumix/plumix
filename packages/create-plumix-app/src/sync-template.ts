import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { loadCatalogContext, rewritePackageJsonFile } from "./catalog.js";

const EXCLUDED_SEGMENTS: ReadonlySet<string> = new Set([
  "node_modules",
  ".cache",
  ".turbo",
  ".wrangler",
  ".plumix",
  "dist",
  // Migrations are committed per example, but a scaffolded project may
  // change its plugin set (hence its schema), so it generates its own.
  "drizzle",
]);

/**
 * Filter passed to `fs.cp` so stray artifacts inside an example (a
 * `node_modules` from a local `pnpm install`, for instance) never reach
 * the baked snapshot. The check is relative to the source root so it
 * doesn't false-positive on an excluded segment in the ancestor path.
 */
export function shouldCopyTemplateEntry(
  srcAbsPath: string,
  root: string,
): boolean {
  const rel = relative(root, srcAbsPath);
  if (rel === "") return true;
  return !rel.split(sep).some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

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
