import { existsSync, statSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Selection } from "./compose/types.js";
import { loadCatalogContext } from "./catalog.js";
import { compose } from "./compose/index.js";
import { ScaffoldError } from "./errors.js";
import { loadRegistry } from "./registry.js";

interface ScaffoldOptions {
  readonly targetDir: string;
  /** Runtime to scaffold; defaults to the sole runtime today. */
  readonly runtimeId?: string;
}

interface ScaffoldResult {
  readonly targetDir: string;
  readonly name: string;
}

export const DEFAULT_RUNTIME = "cloudflare";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// The runtime-agnostic base skeleton, shipped in the package tarball.
const BASE_DIR = join(PACKAGE_ROOT, "base");
// Registry + catalog resolve against the live workspace. The published,
// standalone path (a baked snapshot) is a separate slice.
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");

// npm package-name grammar (lowercase, no spaces/quotes/slashes): the
// project name is spliced into package.json, wrangler.jsonc, and TS string
// literals, so an out-of-grammar name would emit a broken project.
const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

export async function scaffold(
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const { targetDir, runtimeId = DEFAULT_RUNTIME } = options;

  if (!existsSync(join(REPO_ROOT, "pnpm-workspace.yaml"))) {
    throw ScaffoldError.workspaceRequired();
  }

  const name = basename(targetDir);
  if (name.length > 214 || !PROJECT_NAME_RE.test(name)) {
    throw ScaffoldError.invalidProjectName({ name });
  }

  const registry = await loadRegistry(REPO_ROOT);
  const runtime = registry.runtimes.find((r) => r.id === runtimeId);
  if (!runtime) {
    throw ScaffoldError.unknownRuntime({
      runtime: runtimeId,
      available: registry.runtimes.map((r) => r.id),
    });
  }

  // Build the whole project in memory before touching the target, so a
  // resolution failure never leaves a half-created directory behind.
  const selection: Selection = { projectName: name, runtime, plugins: [] };
  const files = await compose({
    selection,
    baseDir: BASE_DIR,
    ctx: await loadCatalogContext(REPO_ROOT),
  });

  await ensureEmptyTarget(targetDir);
  for (const [rel, content] of Object.entries(files)) {
    const dest = join(targetDir, rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, content, "utf8");
  }

  return { targetDir, name };
}

// Validate up front so we never half-write into an occupied directory,
// and create the target when it doesn't exist yet.
async function ensureEmptyTarget(targetDir: string): Promise<void> {
  const parent = dirname(targetDir);
  if (!existsSync(parent)) {
    throw ScaffoldError.targetParentMissing({ parent });
  }
  if (existsSync(targetDir)) {
    if (!statSync(targetDir).isDirectory()) {
      throw ScaffoldError.targetNotDirectory({ targetDir });
    }
    if ((await readdir(targetDir)).length > 0) {
      throw ScaffoldError.targetDirectoryNotEmpty({ targetDir });
    }
    return;
  }
  await mkdir(targetDir);
}
