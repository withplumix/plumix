// Scaffolds representative projects and proves they typecheck and build.
//
// The base skeleton lives inside this package rather than as a workspace
// package, so nothing else ever compiles it. This is what catches a core,
// plugin, or runtime change that would break generated projects.
//
// Generated projects depend on published ranges (`plumix: ^0.1.2`) because
// that is what a real user gets — but installing those would test the last
// release rather than this commit. So every publishable package is packed and
// resolution is redirected at the tarballs via pnpm overrides, which apply
// transitively across the whole plumix graph.
//
// Packing rather than linking is deliberate: a linked package's own
// dependencies stay in the monorepo and don't resolve from the generated
// project, so `link:` fails on anything plumix pulls in at runtime (e.g.
// tailwind). A tarball carries its manifest, so its dependencies install
// normally.
//
// The sibling `.github/scripts/smoke.mjs` answers a different question — do
// the real published tarballs work end to end — by publishing to a throwaway
// Verdaccio and booting the app. It is slower and gates releases. This is the
// fast per-commit canary.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const CLI = join(REPO, "packages/create-plumix-app/dist/index.js");

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

function redirectToTarballs(appDir, tarballs) {
  const manifestPath = join(appDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.pnpm = {
    ...manifest.pnpm,
    overrides: Object.fromEntries(
      [...tarballs].map(([name, tgz]) => [name, `file:${tgz}`]),
    ),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/**
 * Anything reached from the registry resolves as `plumix@0.1.2_…`; ours resolve
 * through `@file+`. Scan the whole store rather than the declared deps — most
 * of the graph arrives transitively, so checking direct deps alone would miss
 * a leak, and an empty list would pass while verifying nothing.
 */
function assertNothingFromRegistry(appDir) {
  const store = readdirSync(join(appDir, "node_modules", ".pnpm"));
  const plumix = store.filter((entry) => /^(plumix@|@plumix\+)/.test(entry));
  if (plumix.length === 0) {
    throw new Error(`No plumix packages in ${appDir} — nothing was verified.`);
  }
  const leaked = plumix.filter((entry) => !entry.includes("@file+"));
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

function smoke(combo, tarballs) {
  const dir = mkdtempSync(join(tmpdir(), `plumix-smoke-${combo.name}-`));
  const app = join(dir, "app");
  try {
    console.log(`\n=== ${combo.name} ===`);
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
    redirectToTarballs(app, tarballs);
    run("pnpm", ["install", "--ignore-workspace", "--silent"], app);
    assertNothingFromRegistry(app);
    if (combo.typescript7) assertTypeScript7(app);

    run("pnpm", ["run", "typecheck"], app);
    run("pnpm", ["run", "build"], app);
    if (combo.secondLocale) assertCatalogsStaged(app, combo.excluded);
    console.log(`=== ${combo.name}: ok ===`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const packs = mkdtempSync(join(tmpdir(), "plumix-smoke-packs-"));
try {
  const tarballs = packPlumixPackages(packs);
  const { loadRegistry } = await import(
    join(REPO, "packages/create-plumix-app/dist/registry.js")
  );
  const { availableAuthMethods } = await import(
    join(REPO, "packages/create-plumix-app/dist/auth-methods.js")
  );
  // From the registry, so a new runtime or plugin joins the matrix on its own.
  const registry = await loadRegistry(REPO);
  // Every runtime times the two shapes. `-y` on every combo: without it the
  // remaining prompts drop the CLI into the wizard on a terminal. A plugin
  // requiring a capability the runtime lacks is left out, as the scaffolder
  // would refuse it by name; today every first-party plugin is offered on
  // every runtime, and `excluded` is what says so.
  const combos = registry.runtimes.flatMap((runtime) => {
    const { id } = runtime;
    const supported = (plugin) =>
      (plugin.requires ?? []).every(
        (capability) => runtime.capabilities?.[capability],
      );
    const excluded = registry.plugins
      .filter((plugin) => !supported(plugin))
      .map((plugin) => plugin.id);
    const selected = registry.plugins
      .filter(supported)
      .map((plugin) => plugin.id);
    const authIds = availableAuthMethods(runtime).map((method) => method.id);
    return [
      // `--plugins=` for none: a bare `-y` takes the recommended plugins.
      { name: `${id}-blank`, args: ["-y", "--runtime", id, "--plugins="] },
      {
        name: `${id}-all-plugins`,
        args: ["-y", "--runtime", id, "-p", selected.join(",")],
        secondLocale: true,
        excluded,
      },
      // Each auth method is a config fragment written as text, so only a
      // generated project that typechecks and builds proves it still fits.
      {
        name: `${id}-all-auth`,
        args: [
          "-y",
          "--runtime",
          id,
          "--plugins=",
          "--auth",
          authIds.join(","),
        ],
      },
      // Every plugin, so the published declarations of the whole graph and
      // the islands `plumix/vite` scans all meet the native compiler.
      {
        name: `${id}-typescript-7`,
        args: ["-y", "--runtime", id, "-p", selected.join(",")],
        typescript7: true,
      },
    ];
  });
  for (const combo of combos) smoke(combo, tarballs);
  console.log(
    `\nSmoke check passed: ${combos.length} generated projects typecheck and build.`,
  );
} finally {
  rmSync(packs, { recursive: true, force: true });
}
