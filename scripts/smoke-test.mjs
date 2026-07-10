#!/usr/bin/env node
// Full-rehearsal smoke test: prove the *published* packages work end to end.
//
// Nothing here uses workspace symlinks. It boots a throwaway Verdaccio
// registry (npmjs as uplink so react/vite/wrangler still resolve), publishes
// every publishable workspace package into it, scaffolds a fresh app *from the
// registry* with `create-plumix-app`, installs it (real node_modules, no
// `workspace:` links), applies D1 migrations against miniflare's local state,
// boots `plumix dev`, and asserts the public site and the admin SPA both serve
// HTTP 200. Exits non-zero on the first failed assertion so it can gate
// `changeset publish`. Cleans up the registry, the dev server, and every temp
// dir on success and on failure.
//
// Usage:  node scripts/smoke-test.mjs
// Env:
//   SMOKE_REGISTRY_PORT  Verdaccio port          (default 4873)
//   SMOKE_APP_PORT       plumix dev port         (default 5173 — matches the
//                        minimal template's local CSRF origin)
//   SMOKE_SKIP_BUILD=1   skip `pnpm build` (assume dist/ is already fresh)
//   SMOKE_KEEP=1         keep temp dirs + registry running for debugging

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_PORT = Number(process.env.SMOKE_REGISTRY_PORT ?? 4873);
const APP_PORT = Number(process.env.SMOKE_APP_PORT ?? 5173);
const REGISTRY = `http://localhost:${REGISTRY_PORT}/`;
const VERDACCIO_VERSION = "6";
const KEEP = process.env.SMOKE_KEEP === "1";

// --- tiny logging ----------------------------------------------------------
const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`.padStart(7);
const log = (msg) => process.stdout.write(`[smoke ${stamp()}] ${msg}\n`);
const fail = (msg) => {
  throw new Error(msg);
};

// --- process + temp-dir bookkeeping for cleanup ----------------------------
/** @type {{name: string, child: import("node:child_process").ChildProcess}[]} */
const bgProcs = [];
/** @type {string[]} */
const tempDirs = [];

function killTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  // Children are spawned `detached`, so they lead their own process group;
  // a negative pid signals the whole group (miniflare/workerd/esbuild kids).
  for (const sig of ["SIGTERM", "SIGKILL"]) {
    try {
      process.kill(-child.pid, sig);
    } catch {
      try {
        child.kill(sig);
      } catch {
        /* already gone */
      }
    }
  }
}

async function cleanup() {
  if (KEEP) {
    log(`SMOKE_KEEP=1 — leaving registry + temp dirs in place:`);
    for (const d of tempDirs) log(`  ${d}`);
    return;
  }
  for (const { name, child } of bgProcs.reverse()) {
    log(`stopping ${name}`);
    killTree(child);
  }
  await new Promise((r) => setTimeout(r, 500));
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// --- child-process helpers -------------------------------------------------
// Run to completion, streaming output; reject on non-zero exit.
function run(cmd, args, { cwd = REPO_ROOT, env, logFile } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: logFile
        ? ["ignore", "pipe", "pipe"]
        : ["ignore", "inherit", "inherit"],
    });
    if (logFile) {
      const out = createWriteStream(logFile);
      child.stdout.pipe(out);
      child.stderr.pipe(out);
    }
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`)),
    );
  });
}

// Run to completion, capturing stdout; reject on non-zero exit.
function capture(cmd, args, { cwd = REPO_ROOT, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(
            new Error(`${cmd} ${args.join(" ")} exited ${code}\n${stderr}`),
          ),
    );
  });
}

// Spawn a long-lived background process (registry / dev server).
function spawnBg(name, cmd, args, { cwd = REPO_ROOT, env, logFile } = {}) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: logFile ? ["ignore", "pipe", "pipe"] : "ignore",
  });
  if (logFile) {
    const out = createWriteStream(logFile);
    child.stdout.pipe(out);
    child.stderr.pipe(out);
  }
  child.unref();
  bgProcs.push({ name, child });
  return child;
}

async function waitForHttp(url, { timeoutMs, expect = 200 }) {
  const deadline = Date.now() + timeoutMs;
  let last = "no attempt";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status === expect) return res.status;
      last = `status ${res.status}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail(`timed out waiting for ${url} (${expect}); last: ${last}`);
}

// --- steps -----------------------------------------------------------------
async function build() {
  if (process.env.SMOKE_SKIP_BUILD === "1") {
    log("SMOKE_SKIP_BUILD=1 — skipping pnpm build");
    return;
  }
  log("building all packages (pnpm build)…");
  await run("pnpm", ["build"]);
}

async function startRegistry(workDir) {
  const vdir = path.join(workDir, "verdaccio");
  await fs.mkdir(path.join(vdir, "storage"), { recursive: true });
  const configPath = path.join(vdir, "config.yaml");
  // `**` proxies to npmjs so third-party deps resolve; the plumix names are
  // hosted locally with anonymous ($all) publish so no login/htpasswd dance.
  await fs.writeFile(
    configPath,
    [
      "storage: ./storage",
      "uplinks:",
      "  npmjs:",
      "    url: https://registry.npmjs.org/",
      "    maxage: 30m",
      "    cache: true",
      "packages:",
      ...["@plumix/*", "plumix", "create-plumix-app"].flatMap((p) => [
        `  '${p}':`,
        "    access: $all",
        "    publish: $all",
        "    unpublish: $all",
      ]),
      "  '**':",
      "    access: $all",
      "    publish: $all",
      "    unpublish: $all",
      "    proxy: npmjs",
      "log: { type: stdout, format: pretty, level: warn }",
      "",
    ].join("\n"),
    "utf8",
  );

  const logFile = path.join(vdir, "verdaccio.log");
  log(`starting Verdaccio on ${REGISTRY} (logs: ${logFile})`);
  spawnBg("verdaccio", "npx", [
    "--yes",
    `verdaccio@${VERDACCIO_VERSION}`,
    "--config",
    configPath,
    "--listen",
    String(REGISTRY_PORT),
  ], { cwd: vdir, logFile });

  await waitForHttp(`${REGISTRY}-/ping`, { timeoutMs: 90_000 });
  log("Verdaccio is up");
}

// A per-run npm config: point the client at Verdaccio, hand it a throwaway
// auth token (the registry ignores it — publish is anonymous), disable
// provenance, and isolate the npm cache in the temp dir so nothing the run
// downloads or scaffolds is served stale from a previous run.
async function writeNpmEnv(workDir) {
  const npmrc = path.join(workDir, ".npmrc");
  await fs.writeFile(
    npmrc,
    [
      `registry=${REGISTRY}`,
      `//localhost:${REGISTRY_PORT}/:_authToken=smoke-local-token`,
      "provenance=false",
      "",
    ].join("\n"),
    "utf8",
  );
  const cache = path.join(workDir, "npm-cache");
  await fs.mkdir(cache, { recursive: true });
  return {
    npm_config_userconfig: npmrc,
    npm_config_registry: REGISTRY,
    npm_config_cache: cache,
  };
}

async function publishAll(workDir, npmEnv) {
  const packs = path.join(workDir, "packs");
  await fs.mkdir(packs, { recursive: true });

  const listing = await capture("pnpm", [
    "-r",
    "list",
    "--depth",
    "-1",
    "--json",
  ]);
  const projects = JSON.parse(listing).filter(
    (p) => p.private !== true && p.name !== "root" && p.path,
  );
  log(`publishing ${projects.length} packages to Verdaccio…`);
  if (projects.length !== 14) {
    fail(`expected 14 publishable packages, found ${projects.length}`);
  }

  for (const proj of projects) {
    // `pnpm pack` resolves `workspace:` + `catalog:` protocols into concrete
    // versions in the packed manifest (plain `npm pack`/`npm publish` would
    // leave them literal and break install). It also runs `prepack`, which
    // bakes create-plumix-app's resolved `templates/` snapshot.
    const out = await capture(
      "pnpm",
      ["pack", "--pack-destination", packs],
      { cwd: proj.path },
    );
    const tgz = out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".tgz"))
      .pop();
    if (!tgz) fail(`pnpm pack produced no tarball for ${proj.name}`);

    // Publish the *tarball* with npm and `--no-provenance`: the packages set
    // `publishConfig.provenance:true` for the real release, which npm honours
    // even under `provenance=false` config — only the CLI flag overrides it,
    // and pnpm doesn't forward it, so we drive npm directly here.
    await run(
      "npm",
      ["publish", tgz, "--registry", REGISTRY, "--no-provenance"],
      { env: npmEnv },
    );
    log(`  published ${proj.name}`);
  }
}

async function scaffoldAndInstall(workDir, npmEnv) {
  const version = JSON.parse(
    await fs.readFile(
      path.join(REPO_ROOT, "packages/create-plumix-app/package.json"),
      "utf8",
    ),
  ).version;

  const scaffoldParent = path.join(workDir, "scaffold");
  await fs.mkdir(scaffoldParent, { recursive: true });
  const appDir = path.join(scaffoldParent, "my-plumix-app");

  log(`scaffolding with create-plumix-app@${version} (from Verdaccio)…`);
  await run(
    "npx",
    ["--yes", `create-plumix-app@${version}`, appDir],
    { cwd: scaffoldParent, env: npmEnv },
  );

  // `npm install` (not pnpm) so package build scripts — notably workerd's
  // binary download that miniflare needs — run without an interactive
  // `pnpm approve-builds`, and node_modules stays flat (real dirs, not a
  // virtual-store symlink). `--force` (not `--legacy-peer-deps`, which would
  // skip peer installation and drop `react`, a required peer of the admin/
  // blocks packages that core's SSR imports) still auto-installs peers but
  // pushes past one upstream optional-peer conflict: the latest wrangler moved
  // its optional `@cloudflare/workers-types` peer to v5 while the template
  // pins v4 — a types-only mismatch. If `--force` ever produced a genuinely
  // broken runtime tree, the 200 assertions below would catch it.
  log("installing the scaffolded app (real registry install)…");
  await run(
    "npm",
    ["install", "--no-audit", "--no-fund", "--force"],
    { cwd: appDir, env: npmEnv },
  );

  // Prove the dependency is a real install from the registry, not a
  // workspace symlink.
  const plumixDir = path.join(appDir, "node_modules", "plumix");
  const st = await fs.lstat(plumixDir).catch(() => null);
  if (!st || st.isSymbolicLink() || !st.isDirectory()) {
    fail(`node_modules/plumix is not a real directory (symlink or missing)`);
  }
  const installed = JSON.parse(
    await fs.readFile(path.join(plumixDir, "package.json"), "utf8"),
  ).version;
  log(`  node_modules/plumix is a real dir @ ${installed}`);
  return appDir;
}

async function migrateAndBoot(appDir) {
  const bin = path.join(appDir, "node_modules", ".bin");
  // Put the app's .bin first so `plumix` resolves and so `plumix migrate
  // apply`'s `wrangler` spawn (and drizzle-kit) are found.
  const env = { PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const plumix = path.join(bin, "plumix");

  log("plumix migrate generate…");
  await run(plumix, ["migrate", "generate"], { cwd: appDir, env });

  log("plumix migrate apply --local (miniflare D1)…");
  await run(plumix, ["migrate", "apply", "--local"], { cwd: appDir, env });

  const logFile = path.join(appDir, "plumix-dev.log");
  log(`plumix dev --port ${APP_PORT} (logs: ${logFile})…`);
  spawnBg("plumix dev", plumix, ["dev", "--port", String(APP_PORT)], {
    cwd: appDir,
    env,
    logFile,
  });

  const base = `http://localhost:${APP_PORT}`;
  log("asserting public front page → 200…");
  await waitForHttp(`${base}/`, { timeoutMs: 90_000 });
  log("  front page 200 ✓");
  log("asserting /_plumix/admin/ → 200…");
  await waitForHttp(`${base}/_plumix/admin/`, { timeoutMs: 30_000 });
  log("  admin 200 ✓");
}

// --- main ------------------------------------------------------------------
async function main() {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "plumix-smoke-"));
  tempDirs.push(workDir);
  log(`work dir: ${workDir}`);

  await build();
  await startRegistry(workDir);
  const npmEnv = await writeNpmEnv(workDir);
  await publishAll(workDir, npmEnv);
  const appDir = await scaffoldAndInstall(workDir, npmEnv);
  await migrateAndBoot(appDir);

  log("SMOKE TEST PASSED — published packages install and serve 200 ✓");
}

let exitCode = 0;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    cleanup().finally(() => process.exit(1));
  });
}
try {
  await main();
} catch (err) {
  exitCode = 1;
  log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await cleanup();
}
process.exit(exitCode);
