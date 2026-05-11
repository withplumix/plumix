#!/usr/bin/env node
/**
 * Drift detection — typechecks the bundled starter template against
 * the live workspace `plumix` packages. Catches the failure mode
 * where a future PR renames a plumix API the template uses; without
 * this guard nothing fires until a user runs `pnpm create plumix-app`
 * and hits the TypeScript error.
 *
 * The script temporarily mutates three repo-root files:
 *   - `pnpm-workspace.yaml` — adds the template path to the workspace
 *   - `pnpm-lock.yaml` — backed up and restored byte-for-byte
 *   - `<template>/package.json` — swaps pinned `^0.1.0` deps to
 *     `workspace:*` / `catalog:` so pnpm resolves them locally
 *
 * All three are backed up and restored via `try/finally` and signal
 * handlers, so Ctrl-C during the typecheck still leaves the repo
 * byte-clean. The transient `node_modules/` pnpm creates inside the
 * template is also removed on restore.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  addWorkspacePath,
  rewriteTemplatePackageJson,
} from "./template-rewrite.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

const WORKSPACE_YAML = path.join(REPO_ROOT, "pnpm-workspace.yaml");
const LOCKFILE = path.join(REPO_ROOT, "pnpm-lock.yaml");
const TEMPLATE_DIR = path.join(PACKAGE_ROOT, "templates", "starter");
const TEMPLATE_PKG = path.join(TEMPLATE_DIR, "package.json");
const TEMPLATE_NODE_MODULES = path.join(TEMPLATE_DIR, "node_modules");
const WORKSPACE_BACKUP = `${WORKSPACE_YAML}.template-typecheck-backup`;
const LOCKFILE_BACKUP = `${LOCKFILE}.template-typecheck-backup`;
const TEMPLATE_PKG_BACKUP = `${TEMPLATE_PKG}.template-typecheck-backup`;

const WORKSPACE_PATH = "packages/create-plumix-app/templates/*";
const DEP_OVERRIDES = {
  plumix: "workspace:*",
  "@plumix/runtime-cloudflare": "workspace:*",
  "@plumix/plugin-blog": "workspace:*",
  "@plumix/plugin-pages": "workspace:*",
  "drizzle-orm": "catalog:",
  react: "catalog:",
  "react-dom": "catalog:",
  "@cloudflare/workers-types": "catalog:",
  "@types/node": "catalog:",
  "@types/react": "catalog:",
  "@types/react-dom": "catalog:",
  "drizzle-kit": "catalog:",
  typescript: "catalog:",
  wrangler: "catalog:",
};

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
  if (existsSync(TEMPLATE_PKG_BACKUP)) {
    copyFileSync(TEMPLATE_PKG_BACKUP, TEMPLATE_PKG);
    rmSync(TEMPLATE_PKG_BACKUP);
  }
  // The transient `pnpm install` created a node_modules inside the
  // template; remove it so the template directory is byte-clean again.
  // Otherwise it'd leak into scaffolded projects (the scaffolder's
  // copy filter excludes it, but leaving cruft around is sloppy).
  if (existsSync(TEMPLATE_NODE_MODULES)) {
    rmSync(TEMPLATE_NODE_MODULES, { recursive: true, force: true });
  }
}

// Signal handlers — Ctrl-C during the typecheck must still restore.
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restore();
  process.exit(143);
});

function run(label, command, args) {
  console.log(`[typecheck-template] ${label}…`);
  const result = spawnSync(command, args, { cwd: REPO_ROOT, stdio: "inherit" });
  return result.status ?? 1;
}

// Refuse to run if a previous invocation crashed without cleanup —
// the backup files still hold the ORIGINAL state. Overwriting them
// here would mean a subsequent "restore" puts the previously-modified
// state back, not the original.
const STALE_BACKUPS = [
  WORKSPACE_BACKUP,
  LOCKFILE_BACKUP,
  TEMPLATE_PKG_BACKUP,
].filter((p) => existsSync(p));
if (STALE_BACKUPS.length > 0) {
  console.error(
    "[typecheck-template] Refusing to run: backup files from a prior crashed run still exist:",
  );
  for (const p of STALE_BACKUPS) console.error(`  - ${p}`);
  console.error(
    "Restore each by moving the backup back over its target (e.g. `mv <file>.template-typecheck-backup <file>`), then retry. If you've already restored manually, delete the leftover backup files.",
  );
  process.exit(1);
}

let exitCode = 0;
try {
  copyFileSync(WORKSPACE_YAML, WORKSPACE_BACKUP);
  copyFileSync(LOCKFILE, LOCKFILE_BACKUP);
  copyFileSync(TEMPLATE_PKG, TEMPLATE_PKG_BACKUP);

  writeFileSync(
    WORKSPACE_YAML,
    addWorkspacePath(readFileSync(WORKSPACE_YAML, "utf-8"), WORKSPACE_PATH),
  );
  writeFileSync(
    TEMPLATE_PKG,
    rewriteTemplatePackageJson(
      readFileSync(TEMPLATE_PKG, "utf-8"),
      DEP_OVERRIDES,
    ),
  );

  // Not `--silent`: if the install fails on CI we want the full error
  // in the log, not just a non-zero exit. CI runs are rare; verbose
  // output > a silent failure.
  const installStatus = run("install with template wired in", "pnpm", [
    "install",
    "--no-frozen-lockfile",
  ]);
  if (installStatus !== 0) {
    exitCode = installStatus;
  } else {
    // Invoke via turbo so `typecheck`'s `dependsOn: ["^topo", "^build"]`
    // builds the upstream plumix packages first. Bypassing turbo (e.g.
    // `pnpm --filter plumix-starter typecheck`) leaves their `dist/`
    // directories empty on a cold CI checkout, and tsc can't resolve
    // the `plumix` / `@plumix/...` modules without the built `.d.ts`s.
    exitCode = run("build deps + typecheck template", "pnpm", [
      "exec",
      "turbo",
      "run",
      "typecheck",
      "--filter",
      "plumix-starter",
    ]);
  }
} catch (error) {
  console.error("[typecheck-template] unexpected error:", error);
  exitCode = 1;
} finally {
  restore();
}

if (exitCode === 0) {
  console.log("[typecheck-template] OK — template matches current plumix API.");
} else {
  console.error(
    "[typecheck-template] FAIL — template no longer typechecks against the current plumix API. See output above.",
  );
}
process.exit(exitCode);
