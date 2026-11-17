// Scaffolds representative projects and proves they typecheck, pass their own
// tests, build and serve: each built server is started, requested and stopped with SIGTERM.
// Combos run in parallel, one per CPU, and each prints its output when it ends. A runtime
// serves one combo at a time: two `wrangler dev` starting together can both claim the
// inspector port they found free.
// A combo that scaffolds magic link first proves its unedited build fails for
// want of a mailer, then adds one.
// Each runtime's all-plugins project then runs `plumix dev` and drives the
// editor in Chromium.
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

import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJsonc } from "jsonc-parser";

const REPO = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const CLI = join(REPO, "packages/create-plumix-app/dist/index.js");
const DEV_EDITOR = join(REPO, "packages/create-plumix-app/smoke/dev-editor");
// Inside the package, where CI's failure upload reads Playwright's output.
const PACKAGE = join(REPO, "packages/create-plumix-app");
const DEV_EDITOR_RESULTS = join(PACKAGE, "test-results");
const DEV_EDITOR_REPORT = join(PACKAGE, "playwright-report");

const { loadRegistry } = await import(
  join(REPO, "packages/create-plumix-app/dist/registry.js")
);
const {
  doctorFailure,
  listeningPort,
  planBoot,
  planInstall,
  planSmokeCombos,
  summarizePlaywrightFailures,
  undeclaredSmokePackages,
  unmailedBuildFailure,
  withStubMailer,
} = await import(join(REPO, "packages/create-plumix-app/dist/smoke-plan.js"));

/**
 * Runs a command to completion, its output appended to `log` rather than the
 * terminal, so parallel combos don't interleave. Resolves to the exit status
 * and output; `run` below rejects on a non-zero status.
 */
function exec(log, cmd, args, { cwd, env, shell = false } = {}) {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      shell,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const read = (chunk) => {
      output += chunk;
    };
    child.stdout.setEncoding("utf8").on("data", read);
    child.stderr.setEncoding("utf8").on("data", read);
    child.once("error", fail);
    child.once("close", (code, signal) => {
      log.push(output);
      done({ status: code ?? signal, output });
    });
  });
}

async function run(log, cmd, args, options) {
  const result = await exec(log, cmd, args, options);
  if (result.status !== 0) {
    throw new Error(
      `\`${[cmd, ...args].join(" ")}\` exited with ${result.status}.`,
    );
  }
  return result.output;
}

const isPlumix = (name) => name === "plumix" || name.startsWith("@plumix/");

async function packPlumixPackages(destination) {
  const listed = JSON.parse(
    execFileSync("pnpm", ["-r", "list", "--depth", "-1", "--json"], {
      cwd: REPO,
      encoding: "utf8",
    }),
  );

  const packed = listed.filter(
    ({ name, private: isPrivate }) => isPlumix(name) && !isPrivate,
  );
  const undeclared = undeclaredSmokePackages(
    packed.map(({ name }) => name),
    JSON.parse(
      readFileSync(
        join(REPO, "packages/create-plumix-app/package.json"),
        "utf8",
      ),
    ),
  );
  if (undeclared.length > 0) {
    throw new Error(
      `Add ${undeclared.join(", ")} to create-plumix-app's devDependencies, so \`pnpm smoke:scaffold\` builds it first.`,
    );
  }

  const missing = packed.filter(({ path }) => !existsSync(join(path, "dist")));
  if (missing.length > 0) {
    throw new Error(
      `${missing.map(({ name }) => name).join(", ")} has no dist/ — run \`pnpm smoke:scaffold\` from the root.`,
    );
  }
  // Each pack lists its tarball's contents; printed only when one fails.
  const log = [];
  try {
    await Promise.all(
      packed.map(({ path }) =>
        run(log, "pnpm", ["pack", "--pack-destination", destination], {
          cwd: path,
        }),
      ),
    );
  } catch (err) {
    console.error(log.join(""));
    throw err;
  }
  return new Map(
    packed.map(({ name, version }) => [
      name,
      join(
        destination,
        `${name.replace("@", "").replace("/", "-")}-${version}.tgz`,
      ),
    ]),
  );
}

function redirectToTarballs(appDir, install) {
  if (install.manifest) {
    const manifestPath = join(appDir, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const [key, value] of Object.entries(install.manifest)) {
      manifest[key] = { ...manifest[key], ...value };
    }
    writeFileSync(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }
  if (install.workspaceOverrides) {
    // The scaffold's pnpm-workspace.yaml declares no `overrides`, so the block
    // is appended. A missing file is created, which makes the project its own
    // workspace root either way.
    const workspacePath = join(appDir, "pnpm-workspace.yaml");
    const existing = existsSync(workspacePath)
      ? readFileSync(workspacePath, "utf8")
      : "";
    const entries = Object.entries(install.workspaceOverrides).map(
      ([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`,
    );
    writeFileSync(
      workspacePath,
      `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}overrides:\n${entries.join("\n")}\n`,
      "utf8",
    );
  }
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
 * The version this package develops against, which is the one CI installs
 * Chromium for: a project on another version would look for a browser build
 * that isn't there.
 */
function addPlaywright(appDir) {
  const { version } = createRequire(import.meta.url)(
    "@playwright/test/package.json",
  );
  const manifestPath = join(appDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.devDependencies = {
    ...manifest.devDependencies,
    "@playwright/test": version,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/**
 * The scaffold's entry template renders the title and excerpt but not the
 * entry content, so the canvas would have no root to mount blocks into. Add
 * the `BlockRenderer` a site renders its content with.
 */
function renderEntryContent(appDir) {
  const themePath = join(appDir, "theme", "index.tsx");
  const theme = readFileSync(themePath, "utf8");
  const anchor =
    "        {data.entry.excerpt ? <p>{data.entry.excerpt}</p> : null}\n";
  if (!theme.includes(anchor)) {
    throw new Error(
      "theme/index.tsx no longer renders the excerpt in its entry template — " +
        "see packages/create-plumix-app/base/theme/index.tsx.",
    );
  }
  writeFileSync(
    themePath,
    `import { BlockRenderer } from "plumix/blocks/renderer";\n${theme.replace(
      anchor,
      `${anchor}        <BlockRenderer content={data.entry.contentBlocks} />\n`,
    )}`,
    "utf8",
  );
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

// How long a started server has to say where it listens, and then to answer.
const SERVE_WINDOW_MS = 90_000;

/**
 * The server is started on port 0, so no other process can take its port
 * between choosing it and binding it.
 */
function boundPort(child) {
  let output = "";
  return new Promise((done, fail) => {
    const read = (chunk) => {
      output += chunk;
      const port = listeningPort(output);
      if (port !== undefined) done(port);
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.once("exit", (code, signal) =>
      fail(
        new Error(
          `The server exited (${signal ?? code}) before it said where it listens.`,
        ),
      ),
    );
    setTimeout(
      () => fail(new Error("The server never said where it listens.")),
      SERVE_WINDOW_MS,
    ).unref();
  });
}

// Detached, so the negative pid reaches everything the server started —
// wrangler's workerd above all.
function signalGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // Already gone.
  }
}

function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalGroup(child, "SIGKILL");
}

// Core's `DRAIN_DEADLINE_MS` (10 s), plus 5 s for the runtime to exit once
// the drain is done.
const STOP_WINDOW_MS = 15_000;

/**
 * A zombie has exited and only waits to be reaped, which a container whose
 * PID 1 reaps no orphans never does, so it doesn't count as running.
 */
function groupRunning(child) {
  return execFileSync("ps", ["-A", "-o", "pgid=,stat="], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .some(
      ([pgid, stat]) => Number(pgid) === child.pid && !stat?.startsWith("Z"),
    );
}

/**
 * Waits for the whole group, not just the shell that spawned the server: a
 * child that outlives the server must fail the combo too. Resolves to
 * whether the group exited in time.
 */
async function terminate(child) {
  signalGroup(child, "SIGTERM");
  const deadline = Date.now() + STOP_WINDOW_MS;
  try {
    while (groupRunning(child)) {
      if (Date.now() > deadline) return false;
      await new Promise((wait) => setTimeout(wait, 200));
    }
    return true;
  } finally {
    // Also when `ps` throws, so no server outlives its combo.
    signalGroup(child, "SIGKILL");
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
  const deadline = Date.now() + SERVE_WINDOW_MS;
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

/**
 * Through the runtime's cli, so the installed runtime's `diagnose` reads
 * the scaffold's config.
 */
async function assertDoctorClean(appDir, log) {
  const bin = join(appDir, "node_modules", ".bin");
  const runtime = installedRuntime(appDir);
  const { doctor } = planBoot(runtime.name, runtime.e2e);
  const output = await run(log, doctor, [], {
    cwd: appDir,
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    shell: true,
  });
  const failure = doctorFailure(output);
  if (failure !== undefined) throw new Error(`${failure}:\n${output}`);
}

/**
 * A magic-link site with no mailer must not build, so a fresh scaffold can't
 * ship one that drops every sign-in link. The rest of the combo then builds
 * with a mailer that sends nowhere.
 */
async function assertBuildNeedsMailer(appDir, packageManager, log) {
  const build = await exec(log, packageManager, ["run", "build"], {
    cwd: appDir,
  });
  const output = build.output;
  const failure =
    build.status === 0
      ? "plumix build without a mailer succeeded"
      : unmailedBuildFailure(output);
  if (failure !== undefined) throw new Error(`${failure}:\n${output}`);
  const config = join(appDir, "plumix.config.ts");
  writeFileSync(config, withStubMailer(readFileSync(config, "utf8")));
}

async function boot(appDir, combo, log) {
  const runtime = installedRuntime(appDir);
  const plan = planBoot(runtime.name, runtime.e2e);
  // The project's bins first, so `plumix`, `wrangler` and whatever they spawn
  // resolve from what this combo installed.
  const bin = join(appDir, "node_modules", ".bin");
  const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` };
  for (const command of plan.migrate) {
    await run(log, command, [], { cwd: appDir, env, shell: true });
  }

  const logFile = join(appDir, "server.log");
  const serverLog = createWriteStream(logFile);
  const child = spawn(plan.start, {
    cwd: appDir,
    env: { ...env, PORT: "0" },
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8").pipe(serverLog);
  child.stderr.setEncoding("utf8").pipe(serverLog);
  const port = boundPort(child);
  // The temp dir goes with the combo, so keep the server's output now.
  const printLogTail = () =>
    log.push(readFileSync(logFile, "utf8").slice(-4000));
  try {
    await assertServes(`http://127.0.0.1:${await port}`, child);
  } catch (err) {
    stop(child);
    printLogTail();
    throw err;
  }
  if (!(await terminate(child))) {
    printLogTail();
    throw new Error(
      `${combo.name}: the server did not exit within ${STOP_WINDOW_MS / 1000} s of SIGTERM.`,
    );
  }
}

/**
 * `plumix dev` is where Vite's dependency optimizer and module rewriting meet
 * the installed plugins, which a production build never exercises. The spec's
 * config's webServer migrates afresh and runs the runtime's dev command.
 */
async function driveEditorUnderDev(appDir, combo, log) {
  renderEntryContent(appDir);
  cpSync(DEV_EDITOR, join(appDir, "dev-editor"), { recursive: true });
  const bin = join(appDir, "node_modules", ".bin");
  const jsonReport = join(appDir, "dev-editor-report.json");
  const results = join(DEV_EDITOR_RESULTS, combo.name);
  try {
    await run(
      log,
      "playwright",
      [
        "test",
        "--config",
        "dev-editor/playwright.config.ts",
        "--output",
        results,
        "--trace",
        "retain-on-failure",
        // The config's reporters plus a JSON one, read back below to name what
        // failed in this script's own error.
        "--reporter",
        "list,html,json",
      ],
      {
        cwd: appDir,
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH}`,
          // Its own port, as other combos' editors run alongside.
          PLUMIX_E2E_PORT_OFFSET: String(combo.index),
          PLAYWRIGHT_HTML_OUTPUT_DIR: join(DEV_EDITOR_REPORT, combo.name),
          PLAYWRIGHT_HTML_OPEN: "never",
          PLAYWRIGHT_JSON_OUTPUT_FILE: jsonReport,
        },
      },
    );
  } catch (err) {
    // No failed test means Playwright stopped before any ran: the dev server
    // never answered, which its [WebServer] output above shows.
    const failed = existsSync(jsonReport)
      ? summarizePlaywrightFailures(
          JSON.parse(readFileSync(jsonReport, "utf8")),
        )
      : [];
    const failures =
      failed.length > 0
        ? failed
        : ["plumix dev did not serve (see the [WebServer] output above)"];
    throw new Error(
      `${combo.name}: the editor failed under \`plumix dev\`:\n` +
        failures.map((line) => `  - ${line}`).join("\n") +
        `\nTrace under ${results}.`,
      { cause: err },
    );
  }
}

const serving = new Map();

/** Runs `task` once every earlier task holding `key` has settled. */
function serially(key, task) {
  const turn = (serving.get(key) ?? Promise.resolve()).then(task);
  serving.set(
    key,
    turn.catch(() => {}),
  );
  return turn;
}

async function smoke(combo, tarballs, log) {
  const dir = mkdtempSync(join(tmpdir(), `plumix-smoke-${combo.name}-`));
  const app = join(dir, "app");
  const pm = combo.packageManager;
  try {
    await run(log, "node", [
      CLI,
      app,
      ...combo.args,
      "--no-install",
      "--no-git",
      "--no-db",
    ]);

    if (combo.secondLocale) enableSecondLocale(app);
    if (combo.typescript7) useTypeScript7(app);
    if (combo.devEditor) addPlaywright(app);
    const install = planInstall(pm, tarballs);
    redirectToTarballs(app, install);
    const [installer, ...installArgs] = install.command;
    await run(log, installer, installArgs, { cwd: app });
    assertNothingFromRegistry(app, pm);
    if (combo.typescript7) assertTypeScript7(app);
    if (combo.magicLink) await assertBuildNeedsMailer(app, pm, log);

    await run(log, pm, ["run", "typecheck"], { cwd: app });
    await run(log, pm, ["run", "test"], { cwd: app });
    await run(log, pm, ["run", "build"], { cwd: app });
    if (combo.secondLocale) assertCatalogsStaged(app, combo.excluded);
    await assertDoctorClean(app, log);
    await serially(combo.runtime, async () => {
      await boot(app, combo, log);
      if (combo.devEditor) await driveEditorUnderDev(app, combo, log);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Prints a combo's output in one block when it ends, and records a failure. */
async function report(combo, tarballs, failures) {
  const log = [];
  const started = Date.now();
  let outcome = "ok";
  try {
    await smoke(combo, tarballs, log);
  } catch (err) {
    outcome = "failed";
    failures.push(combo.name);
    log.push(`\n${err.stack ?? err}\n`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n=== ${combo.name} (${combo.packageManager}) ===\n${log.join("")}` +
      `=== ${combo.name}: ${outcome} in ${seconds} s ===`,
  );
}

const packs = mkdtempSync(join(tmpdir(), "plumix-smoke-packs-"));
try {
  const tarballs = await packPlumixPackages(packs);
  // From the registry, so a new runtime or plugin joins the matrix on its own.
  // `SMOKE_SHARD=2/3` runs every third combo from the second, as CI splits
  // them across runners; the index keeps each combo's port its own. An env
  // var, not an argument: turbo hashes arguments into every build it runs.
  const [part, parts] = (process.env.SMOKE_SHARD || "1/1")
    .split("/")
    .map(Number);
  const combos = planSmokeCombos(await loadRegistry(REPO))
    .map((combo, index) => ({ ...combo, index }))
    .filter(({ index }) => index % parts === part - 1);
  const queue = [...combos];
  const failures = [];
  await Promise.all(
    Array.from({ length: availableParallelism() }, async () => {
      for (let combo; (combo = queue.shift());) {
        await report(combo, tarballs, failures);
      }
    }),
  );
  if (failures.length > 0) {
    console.error(`\nSmoke check failed: ${failures.join(", ")}.`);
    process.exitCode = 1;
  } else {
    console.log(
      `\nSmoke check passed: ${combos.length} generated projects typecheck, pass their tests, build, serve and stop.`,
    );
  }
} finally {
  rmSync(packs, { recursive: true, force: true });
}
