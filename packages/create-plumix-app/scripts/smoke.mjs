// Scaffolds representative projects and proves they typecheck, build and
// serve: each built server is started and requested before the next combo.
//
// The base skeleton lives inside this package rather than as a workspace
// package, so nothing else ever compiles it. This is what catches a core,
// plugin, or runtime change that would break generated projects.
//
// Generated projects depend on published ranges (`plumix: ^0.1.2`) because
// that is what a real user gets — but installing those would test the last
// release rather than this commit. So every publishable package is packed and
// resolution is redirected at the tarballs via pnpm overrides, which apply
// transitively across the whole plumix graph. Each combo installs with its
// runtime's declared package manager, pnpm unless it names another.
//
// Packing rather than linking is deliberate: a linked package's own
// dependencies stay in the monorepo and don't resolve from the generated
// project, so `link:` fails on anything plumix pulls in at runtime (e.g.
// tailwind). A tarball carries its manifest, so its dependencies install
// normally.
//
// The sibling `.github/scripts/smoke.mjs` answers a different question — do
// the real published tarballs work end to end — by publishing to a throwaway
// Verdaccio and booting `plumix dev` on Cloudflare. It is slower and gates
// releases. This is the fast per-commit canary.

import { execFileSync, execSync, spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJsonc } from "jsonc-parser";

const REPO = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const CLI = join(REPO, "packages/create-plumix-app/dist/index.js");

const { loadRegistry } = await import(
  join(REPO, "packages/create-plumix-app/dist/registry.js")
);
const { planBoot, planInstall, planSmokeCombos } = await import(
  join(REPO, "packages/create-plumix-app/dist/smoke-plan.js")
);

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit", encoding: "utf8" });

const isPlumix = (name) => name === "plumix" || name.startsWith("@plumix/");

function packPlumixPackages(destination) {
  const listed = JSON.parse(
    execFileSync("pnpm", ["-r", "list", "--depth", "-1", "--json"], {
      cwd: REPO,
      encoding: "utf8",
    }),
  );

  const tarballs = new Map();
  for (const { name, version, path, private: isPrivate } of listed) {
    if (!isPlumix(name) || isPrivate) continue;
    // `create-plumix-app` depends on none of these, so turbo's `^build` never
    // builds them; packing an unbuilt one would fail far from the cause.
    if (!existsSync(join(path, "dist"))) {
      throw new Error(`${name} has no dist/ — run \`pnpm build\` first.`);
    }
    run("pnpm", ["pack", "--pack-destination", destination], path);
    const file = `${name.replace("@", "").replace("/", "-")}-${version}.tgz`;
    tarballs.set(name, join(destination, file));
  }
  return tarballs;
}

function redirectToTarballs(appDir, patch) {
  const manifestPath = join(appDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const [key, value] of Object.entries(patch)) {
    manifest[key] = { ...manifest[key], ...value };
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/**
 * Anything reached from the registry resolves as `plumix@0.1.2_…` in pnpm's
 * store and as `plumix@0.1.2` in Bun's lockfile; ours resolve through the
 * tarball. Scan everything installed rather than the declared deps — most of
 * the graph arrives transitively, so checking direct deps alone would miss a
 * leak, and an empty list would pass while verifying nothing.
 */
function assertNothingFromRegistry(appDir, packageManager) {
  const resolved =
    packageManager === "bun"
      ? Object.values(
          parseJsonc(readFileSync(join(appDir, "bun.lock"), "utf8")).packages,
        ).map(([resolution]) => resolution)
      : readdirSync(join(appDir, "node_modules", ".pnpm"));
  const plumix = resolved.filter((entry) =>
    /^(plumix@|@plumix[+/])/.test(entry),
  );
  if (plumix.length === 0) {
    throw new Error(`No plumix packages in ${appDir} — nothing was verified.`);
  }
  const leaked = plumix.filter(
    (entry) => !(entry.includes("@file+") || entry.includes(".tgz")),
  );
  if (leaked.length > 0) {
    throw new Error(
      `Resolved from the registry rather than this commit: ${leaked.join(", ")}. ` +
        `The overrides did not take, so this check is validating the last release.`,
    );
  }
}

/**
 * Turn on a second locale, and name the plugins whose catalogs that should
 * pull through. A plugin's admin catalogs are only staged for locales the site
 * enables, so the scaffold's single-locale default stops short of the seam a
 * consumer install is here to prove — the manifest emits no catalog URLs, and
 * nothing copies `<plugin>/locales/<locale>.mjs` out of the installed tarball.
 *
 * Which plugins reach it is not obvious and not stable: a plugin only qualifies
 * for a locale it declares in its own `i18n` slot and that isn't its
 * `sourceLocale`. Every first-party plugin now declares the full set it ships,
 * so all of them qualify. The expectation is spelled out rather than derived —
 * a plugin dropping the locale should fail here, not quietly reduce what this
 * smoke covers to nothing.
 *
 * Keyed by plugin id, which is what the staged path uses: `audit_log` is the id
 * behind `@plumix/plugin-audit-log`, and that gap is the one thing here that
 * resolution has to bridge rather than assume.
 */
const SECOND_LOCALE = "uk";
const EXPECT_CATALOGS = [
  "audit_log",
  "blog",
  "comments",
  "media",
  "menu",
  "og",
  "pages",
];

/**
 * Generated projects install TypeScript 6, but nothing in them needs its
 * compiler API — `typecheck` is plain `tsc`, and `plumix/vite` parses with
 * Vite's own parser — so a user may move to TypeScript 7. Swap it in, then
 * confirm the install honoured it: a combo that quietly kept 6 would pass
 * while proving nothing about 7.
 */
function useTypeScript7(appDir) {
  const manifestPath = join(appDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.devDependencies = { ...manifest.devDependencies, typescript: "^7" };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function assertTypeScript7(appDir) {
  const { version } = JSON.parse(
    readFileSync(
      join(appDir, "node_modules", "typescript", "package.json"),
      "utf8",
    ),
  );
  if (!version.startsWith("7.")) {
    throw new Error(
      `Expected TypeScript 7 in ${appDir}, found ${version}; the combo would not test 7.`,
    );
  }
}

function enableSecondLocale(appDir) {
  const configPath = join(appDir, "plumix.config.ts");
  const config = readFileSync(configPath, "utf8");
  // `src/compose/config.ts` closes the call with the theme slot — but may then
  // append an `declare module` block, so this is not end-of-file.
  const anchor = "  theme,\n});";
  if (!config.includes(anchor)) {
    throw new Error(
      "plumix.config.ts no longer closes with the theme slot — see " +
        "packages/create-plumix-app/src/compose/config.ts.",
    );
  }
  const i18n = `  i18n: { defaultLocale: "en", locales: ["en", "${SECOND_LOCALE}"] },\n`;
  writeFileSync(
    configPath,
    config.replace(anchor, `  theme,\n${i18n}});`),
    "utf8",
  );
}

/**
 * The build stages each declared catalog into the admin assets it serves.
 * Asserting they arrived is what makes the locale above a regression pin
 * rather than a passenger: the manifest can silently skip URL emission for a
 * plugin it wrongly believes admin already bundled, and the build stays green
 * either way.
 */
function assertCatalogsStaged(appDir, excluded) {
  const adminDir = join(appDir, "dist/client/_plumix/admin/plugins");
  const missing = EXPECT_CATALOGS.filter(
    (id) =>
      !excluded.includes(id) &&
      !existsSync(join(adminDir, id, "locales", `${SECOND_LOCALE}.mjs`)),
  );
  if (missing.length > 0) {
    throw new Error(
      `No ${SECOND_LOCALE} catalog staged under ${adminDir} for: ${missing.join(", ")}. ` +
        `The manifest emitted no catalog URL for them, so a site would fall back to English.`,
    );
  }
}

/**
 * The runtime package the project installed, found the way the Playwright
 * helper finds it: the dependency carrying a runtime scaffold block. Read from
 * the installed tarball, so the published manifest is what declares the boot.
 */
function installedRuntime(appDir) {
  const { dependencies } = JSON.parse(
    readFileSync(join(appDir, "package.json"), "utf8"),
  );
  for (const name of Object.keys(dependencies)) {
    const manifestPath = join(appDir, "node_modules", name, "package.json");
    if (!existsSync(manifestPath)) continue;
    const { plumix } = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (plumix?.scaffold?.kind === "runtime") {
      return { name, e2e: plumix.e2e ?? {} };
    }
  }
  throw new Error(`No runtime package among the dependencies of ${appDir}.`);
}

function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

// Detached, so the negative pid reaches everything the shell started —
// wrangler's workerd above all.
function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

/**
 * The three requests a working site answers: the public front page, the
 * admin shell, and the whoami RPC the admin boots from. The first is polled
 * until the server is up; a server that exits first fails at once.
 */
async function assertServes(base, child) {
  const exited = new Promise((_, fail) =>
    child.once("exit", (code, signal) =>
      fail(
        new Error(`The server exited (${signal ?? code}) before it served.`),
      ),
    ),
  );
  exited.catch(() => {});
  const deadline = Date.now() + 90_000;
  for (;;) {
    const attempt = await Promise.race([
      fetch(`${base}/`).then(
        (res) => (res.status === 200 ? null : `status ${res.status}`),
        (err) => err.message,
      ),
      exited,
    ]);
    if (attempt === null) break;
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for ${base}/ to answer 200; last: ${attempt}`,
      );
    }
    await new Promise((wait) => setTimeout(wait, 500));
  }

  const admin = await fetch(`${base}/_plumix/admin/`);
  if (admin.status !== 200) {
    throw new Error(`${base}/_plumix/admin/ answered ${admin.status}.`);
  }
  const session = await fetch(`${base}/_plumix/rpc/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-plumix-request": "1" },
    body: JSON.stringify({ json: {} }),
  });
  if (session.status !== 200) {
    throw new Error(
      `${base}/_plumix/rpc/auth/session answered ${session.status}: ${await session.text()}`,
    );
  }
}

async function boot(appDir) {
  const runtime = installedRuntime(appDir);
  const plan = planBoot(runtime.name, runtime.e2e);
  // The project's bins first, so `plumix`, `wrangler` and whatever they spawn
  // resolve from what this combo installed.
  const bin = join(appDir, "node_modules", ".bin");
  const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` };
  for (const command of plan.migrate) {
    execSync(command, { cwd: appDir, env, stdio: "inherit" });
  }

  const port = await freePort();
  const logFile = join(appDir, "server.log");
  const log = createWriteStream(logFile);
  const child = spawn(plan.start, {
    cwd: appDir,
    env: { ...env, PORT: String(port) },
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  try {
    await assertServes(`http://127.0.0.1:${port}`, child);
  } catch (err) {
    // The temp dir goes with the combo, so surface the server's output now.
    console.error(readFileSync(logFile, "utf8").slice(-4000));
    throw err;
  } finally {
    stop(child);
  }
}

async function smoke(combo, tarballs) {
  const dir = mkdtempSync(join(tmpdir(), `plumix-smoke-${combo.name}-`));
  const app = join(dir, "app");
  const pm = combo.packageManager;
  try {
    console.log(`\n=== ${combo.name} (${pm}) ===`);
    run("node", [
      CLI,
      app,
      ...combo.args,
      "--no-install",
      "--no-git",
      "--no-db",
    ]);

    if (combo.secondLocale) enableSecondLocale(app);
    if (combo.typescript7) useTypeScript7(app);
    const install = planInstall(pm, tarballs);
    redirectToTarballs(app, install.manifest);
    const [installer, ...installArgs] = install.command;
    run(installer, installArgs, app);
    assertNothingFromRegistry(app, pm);
    if (combo.typescript7) assertTypeScript7(app);

    run(pm, ["run", "typecheck"], app);
    run(pm, ["run", "build"], app);
    if (combo.secondLocale) assertCatalogsStaged(app, combo.excluded);
    await boot(app);
    console.log(`=== ${combo.name}: ok ===`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const packs = mkdtempSync(join(tmpdir(), "plumix-smoke-packs-"));
try {
  const tarballs = packPlumixPackages(packs);
  // From the registry, so a new runtime or plugin joins the matrix on its own.
  const combos = planSmokeCombos(await loadRegistry(REPO));
  for (const combo of combos) await smoke(combo, tarballs);
  console.log(
    `\nSmoke check passed: ${combos.length} generated projects typecheck, build and serve.`,
  );
} finally {
  rmSync(packs, { recursive: true, force: true });
}
