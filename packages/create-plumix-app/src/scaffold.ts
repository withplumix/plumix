import { existsSync, statSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Selection } from "./compose/types.js";
import type { ScaffoldSources } from "./sources.js";
import { resolveAuthMethods } from "./auth-methods.js";
import { compose } from "./compose/index.js";
import { ScaffoldError } from "./errors.js";
import { loadSources } from "./sources.js";

interface ScaffoldOptions {
  readonly targetDir: string;
  /** Runtime to scaffold; defaults to the sole runtime today. */
  readonly runtimeId?: string;
  /** Plugin ids to include; defaults to none (a blank app). */
  readonly pluginIds?: readonly string[];
  /** Optional auth methods on top of passkey; defaults to none. */
  readonly authMethodIds?: readonly string[];
  /** Pre-loaded sources (e.g. from the wizard) to avoid a second load. */
  readonly sources?: ScaffoldSources;
}

interface ScaffoldResult {
  readonly targetDir: string;
  readonly name: string;
}

export const DEFAULT_RUNTIME = "cloudflare";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// The runtime-agnostic base skeleton, shipped in the package tarball.
const BASE_DIR = join(PACKAGE_ROOT, "base");
// In-workspace, sources come from the live monorepo here; a published
// install has no monorepo and reads the snapshot baked next to the package.
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const SNAPSHOT_PATH = join(PACKAGE_ROOT, "registry.json");

/** Load the registry + catalog context (live workspace or baked snapshot). */
export function loadScaffoldSources(): Promise<ScaffoldSources> {
  return loadSources(REPO_ROOT, SNAPSHOT_PATH);
}

// npm package-name grammar (lowercase, no spaces/quotes/slashes): the
// project name is spliced into package.json, wrangler.jsonc, and TS string
// literals, so an out-of-grammar name would emit a broken project.
const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

export function isValidProjectName(name: string): boolean {
  return name.length > 0 && name.length <= 214 && PROJECT_NAME_RE.test(name);
}

export async function scaffold(
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const {
    targetDir,
    runtimeId = DEFAULT_RUNTIME,
    pluginIds = [],
    authMethodIds = [],
  } = options;

  const name = basename(targetDir);
  if (!isValidProjectName(name)) {
    throw ScaffoldError.invalidProjectName({ name });
  }

  const { registry, ctx } = options.sources ?? (await loadScaffoldSources());
  const runtime = registry.runtimes.find((r) => r.id === runtimeId);
  if (!runtime) {
    throw ScaffoldError.unknownRuntime({
      runtime: runtimeId,
      available: registry.runtimes.map((r) => r.id),
    });
  }

  const plugins = [...new Set(pluginIds)].map((id) => {
    const plugin = registry.plugins.find((p) => p.id === id);
    if (!plugin) {
      throw ScaffoldError.unknownPlugin({
        plugin: id,
        available: registry.plugins.map((p) => p.id),
      });
    }
    return plugin;
  });

  const authMethods = resolveAuthMethods(authMethodIds, runtime);

  // Build the whole project in memory before touching the target, so a
  // resolution failure never leaves a half-created directory behind.
  const selection: Selection = {
    projectName: name,
    runtime,
    plugins,
    authMethods,
  };
  const files = await compose({ selection, baseDir: BASE_DIR, ctx });

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
