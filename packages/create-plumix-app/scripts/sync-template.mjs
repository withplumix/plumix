#!/usr/bin/env node
/**
 * Snapshot `examples/minimal` into the package's `templates/starter`
 * directory so the published tarball carries a self-contained copy with
 * pnpm's `workspace:`/`catalog:` protocols already resolved.
 *
 * Wired as `prepack` (after `build`, so `dist/` exists). The resolution
 * logic lives in `src/sync-template.ts` — shared with the scaffolder and
 * unit-tested — and is imported here from the freshly built `dist/`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { syncTemplate } from "../dist/sync-template.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

const source = path.join(REPO_ROOT, "examples", "minimal");
const dest = path.join(PACKAGE_ROOT, "templates", "starter");

await syncTemplate({ source, dest, repoRoot: REPO_ROOT });

console.log(`[sync-template] snapshotted ${source} → ${dest}`);
