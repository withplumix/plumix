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

    redirectToTarballs(app, tarballs);
    run("pnpm", ["install", "--ignore-workspace", "--silent"], app);
    assertNothingFromRegistry(app);

    run("pnpm", ["run", "typecheck"], app);
    run("pnpm", ["run", "build"], app);
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
  // From the registry, so a new plugin joins this combo on its own.
  const plugins = (await loadRegistry(REPO)).plugins.map((p) => p.id);

  // `-y` on every combo: without it the runtime stays an open prompt and the
  // CLI drops into the wizard on a terminal. Media is the only plugin
  // declaring `requires`, so all-plugins covers the capability seam too.
  const combos = [
    { name: "blank", args: ["-y"] },
    { name: "all-plugins", args: ["-y", "-p", plugins.join(",")] },
  ];
  for (const combo of combos) smoke(combo, tarballs);
  console.log(
    `\nSmoke check passed: ${combos.length} generated projects typecheck and build.`,
  );
} finally {
  rmSync(packs, { recursive: true, force: true });
}
