#!/usr/bin/env node
/**
 * Snapshot `examples/minimal` into the package's `templates/starter`
 * directory so the published tarball carries a self-contained copy.
 *
 * Wired as `prepack` — pnpm runs it before `pnpm pack` / `pnpm
 * publish`. Skipped at dev/test time: the scaffolder resolves
 * `examples/minimal` directly from the workspace via a relative path
 * (see `src/scaffold.ts`), so the snapshot is only needed once the
 * package is detached from its monorepo.
 *
 * Dep rewriting (`workspace:*` / `catalog:` → SemVer) lives in
 * `scaffold.ts`, not here. Keeping rewriting in one place means the
 * snapshot stays byte-identical to the workspace example.
 */
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

const SOURCE = path.join(REPO_ROOT, "examples", "minimal");
const DEST = path.join(PACKAGE_ROOT, "templates", "starter");

const EXCLUDED_SEGMENTS = new Set([
  "node_modules",
  ".cache",
  ".turbo",
  ".wrangler",
  ".plumix",
  "dist",
]);

function shouldCopy(srcPath) {
  const rel = path.relative(SOURCE, srcPath);
  if (rel === "") return true;
  return !rel.split(path.sep).some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });
await cp(SOURCE, DEST, { recursive: true, filter: shouldCopy });

console.log(`[sync-template] snapshotted ${SOURCE} → ${DEST}`);
