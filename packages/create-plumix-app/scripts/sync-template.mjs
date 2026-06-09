#!/usr/bin/env node
/**
 * Snapshot every `examples/*` into a like-named `templates/<name>`
 * directory so the published tarball carries a self-contained copy of
 * each, with pnpm's `workspace:`/`catalog:` protocols already resolved.
 *
 * Wired as `prepack` (after `build`, so `dist/` exists). The resolution
 * logic lives in `src/sync-template.ts` — shared with the scaffolder and
 * unit-tested — and is imported here from the freshly built `dist/`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { syncAllTemplates } from "../dist/sync-template.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

const names = await syncAllTemplates({
  examplesDir: path.join(REPO_ROOT, "examples"),
  templatesDir: path.join(PACKAGE_ROOT, "templates"),
  repoRoot: REPO_ROOT,
});

console.log(`[sync-template] snapshotted templates: ${names.join(", ")}`);
