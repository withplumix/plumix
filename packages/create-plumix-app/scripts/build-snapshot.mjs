#!/usr/bin/env node
/**
 * Bake the scaffold registry snapshot (runtimes + plugins + catalog
 * context) into `registry.json` so the published CLI scaffolds without the
 * monorepo. Wired as `prepack` after `build`, importing the resolution
 * logic from the freshly built `dist/` — shared with the scaffolder and
 * unit-tested via `src/snapshot.ts`.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSnapshot, serializeSnapshot } from "../dist/snapshot.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

const snapshot = await buildSnapshot(REPO_ROOT);
writeFileSync(
  path.join(PACKAGE_ROOT, "registry.json"),
  serializeSnapshot(snapshot),
);

const { runtimes, plugins } = snapshot.registry;
console.log(
  `[build-snapshot] wrote registry.json (${runtimes.length} runtime(s), ${plugins.length} plugin(s))`,
);
