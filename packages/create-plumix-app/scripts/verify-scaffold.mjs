#!/usr/bin/env node
/**
 * Scaffold smoke E2E — proves a freshly-scaffolded project actually
 * builds end-to-end against the current workspace plumix packages.
 * Complements the typecheck-only drift detection in
 * `typecheck-template.mjs`: this one runs the CLI binary, installs,
 * and invokes `plumix build`, so it catches breakage at the build /
 * vite / codegen layer that pure typecheck would miss.
 *
 * Mutations:
 *   - `pnpm-workspace.yaml` — adds the scaffold dir glob
 *   - `pnpm-lock.yaml` — backed up + restored byte-for-byte
 *   - `.cache/scaffold-smoke/` — the temp scaffold root, wiped on
 *     every exit path (try/finally, SIGINT, SIGTERM)
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { assertBuildOutputs } from "./build-assertions.mjs";
import { TEMPLATE_DEP_OVERRIDES } from "./template-deps.mjs";
import {
  addWorkspacePath,
  rewriteTemplatePackageJson,
} from "./template-rewrite.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

const WORKSPACE_YAML = path.join(REPO_ROOT, "pnpm-workspace.yaml");
const LOCKFILE = path.join(REPO_ROOT, "pnpm-lock.yaml");
const SMOKE_ROOT = path.join(REPO_ROOT, ".cache", "scaffold-smoke");
const SMOKE_WORKSPACE_GLOB = ".cache/scaffold-smoke/*";
const SCAFFOLD_NAME = "smoke-app";
const SCAFFOLD_DIR = path.join(SMOKE_ROOT, SCAFFOLD_NAME);

const WORKSPACE_BACKUP = `${WORKSPACE_YAML}.scaffold-smoke-backup`;
const LOCKFILE_BACKUP = `${LOCKFILE}.scaffold-smoke-backup`;

// Check the actual worker bundle vite emits. `.plumix/worker.ts` is
// also produced, but it's not declared in turbo's `outputs:` for
// `build`, so cache-hit replays don't restore it — picking a real
// build artifact instead so any output-existence check is meaningful.
const EXPECTED_OUTPUTS = ["dist/plumix_starter/index.js"];

let restored = false;

function restore() {
  if (restored) return;
  restored = true;
  if (existsSync(WORKSPACE_BACKUP)) {
    copyFileSync(WORKSPACE_BACKUP, WORKSPACE_YAML);
    rmSync(WORKSPACE_BACKUP);
  }
  if (existsSync(LOCKFILE_BACKUP)) {
    copyFileSync(LOCKFILE_BACKUP, LOCKFILE);
    rmSync(LOCKFILE_BACKUP);
  }
  if (existsSync(SMOKE_ROOT)) {
    rmSync(SMOKE_ROOT, { recursive: true, force: true });
  }
}

process.on("SIGINT", () => {
  restore();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restore();
  process.exit(143);
});

function run(label, command, args, cwd = REPO_ROOT) {
  console.log(`[verify-scaffold] ${label}…`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  return result.status ?? 1;
}

// Refuse to run if a previous invocation crashed mid-flight — backup
// files / smoke dir from the prior run hold pre-modification state.
// Overwriting them here would corrupt the restore path.
const STALE = [WORKSPACE_BACKUP, LOCKFILE_BACKUP].filter((p) => existsSync(p));
if (STALE.length > 0 || existsSync(SMOKE_ROOT)) {
  console.error(
    "[verify-scaffold] Refusing to run: leftovers from a prior crashed run exist:",
  );
  for (const p of STALE) console.error(`  - ${p}`);
  if (existsSync(SMOKE_ROOT)) console.error(`  - ${SMOKE_ROOT}`);
  console.error(
    "Restore the backup files (move each `.scaffold-smoke-backup` back over its target) and remove the smoke dir, then retry.",
  );
  process.exit(1);
}

let exitCode = 0;
try {
  copyFileSync(WORKSPACE_YAML, WORKSPACE_BACKUP);
  copyFileSync(LOCKFILE, LOCKFILE_BACKUP);

  // Build the CLI itself before invoking it — the smoke proves the
  // BUILT artifact works, not just the source.
  const cliBuildStatus = run("build create-plumix-app", "pnpm", [
    "exec",
    "turbo",
    "run",
    "build",
    "--filter",
    "create-plumix-app",
  ]);
  if (cliBuildStatus !== 0) {
    exitCode = cliBuildStatus;
    throw new Error("CLI build failed; see output above.");
  }

  mkdirSync(SMOKE_ROOT, { recursive: true });

  const scaffoldStatus = run("scaffold to tempdir", "node", [
    path.join(PACKAGE_ROOT, "dist", "index.js"),
    SCAFFOLD_DIR,
  ]);
  if (scaffoldStatus !== 0) {
    exitCode = scaffoldStatus;
    throw new Error("CLI scaffold failed; see output above.");
  }

  // Wire scaffold into the workspace so pnpm resolves workspace:*
  // versions of the plumix packages — none of them are on npm yet.
  writeFileSync(
    WORKSPACE_YAML,
    addWorkspacePath(
      readFileSync(WORKSPACE_YAML, "utf-8"),
      SMOKE_WORKSPACE_GLOB,
    ),
  );

  const scaffoldPkg = path.join(SCAFFOLD_DIR, "package.json");
  writeFileSync(
    scaffoldPkg,
    rewriteTemplatePackageJson(
      readFileSync(scaffoldPkg, "utf-8"),
      TEMPLATE_DEP_OVERRIDES,
    ),
  );

  const installStatus = run("install workspace deps", "pnpm", [
    "install",
    "--no-frozen-lockfile",
  ]);
  if (installStatus !== 0) {
    exitCode = installStatus;
    throw new Error("workspace install failed; see output above.");
  }

  // Build the workspace plumix packages the scaffold imports.
  // Turbo's cache is honoured here — upstream re-builds only when
  // their own sources change.
  const upstreamBuildStatus = run("build workspace plumix packages", "pnpm", [
    "exec",
    "turbo",
    "run",
    "build",
    "--filter",
    "plumix",
    "--filter",
    "@plumix/runtime-cloudflare",
    "--filter",
    "@plumix/plugin-blog",
    "--filter",
    "@plumix/plugin-pages",
  ]);
  if (upstreamBuildStatus !== 0) {
    exitCode = upstreamBuildStatus;
    throw new Error("workspace plumix build failed; see output above.");
  }

  // Build the scaffold directly with `plumix build`, NOT via turbo.
  // The scaffold dir is `.gitignore`d, which means turbo doesn't see
  // its source files for hash computation — every run cache-hits with
  // the first run's output, masking template breakage. Going around
  // turbo for this step keeps cache semantics correct (upstream stays
  // cached) while ensuring the smoke build always executes fresh.
  const buildStatus = run(
    "build scaffolded project",
    "pnpm",
    ["exec", "plumix", "build"],
    SCAFFOLD_DIR,
  );
  if (buildStatus !== 0) {
    exitCode = buildStatus;
    throw new Error("scaffold build failed; see output above.");
  }

  assertBuildOutputs(SCAFFOLD_DIR, EXPECTED_OUTPUTS);
} catch (error) {
  if (exitCode === 0) {
    console.error("[verify-scaffold] unexpected error:", error);
    exitCode = 1;
  }
} finally {
  restore();
}

if (exitCode === 0) {
  console.log(
    "[verify-scaffold] OK — scaffold + install + build round-trip succeeded.",
  );
} else {
  console.error("[verify-scaffold] FAIL — see output above.");
}
process.exit(exitCode);
