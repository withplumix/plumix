#!/usr/bin/env node
// Compile a package's `.po` catalogs to runtime `.mjs` and emit a
// `.d.mts` beside each. Run from a package root (turbo runs scripts in
// the package cwd). The compiled artifacts are gitignored and produced
// on demand — see the package's `i18n:compile` task.
//
// Lives in tooling (a leaf devDep), NOT the plumix CLI: core/admin sit
// upstream of plumix in the build graph, so routing their compile
// through `plumix` would form a dependency cycle.
import { spawn } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const cwd = process.cwd();
const localesDir = join(cwd, "locales");

const CATALOG_DTS =
  "export declare const messages: Record<string, string | readonly string[]>;\n";

// Resolve lingui from this tooling package, not the consumer — so a
// catalog package needs only `@plumix/lingui-config` as a devDep.
const require = createRequire(import.meta.url);
const linguiBin = join(dirname(require.resolve("@lingui/cli")), "lingui.js");

// `--namespace es` emits ESM `.mjs`; without it lingui defaults to CJS
// `.js`. No `--strict` so missing translations fall back to source.
// Capture output to fail on a parse error, which lingui only warns about.
const child = spawn(
  process.execPath,
  [linguiBin, "compile", "--namespace", "es"],
  { stdio: ["inherit", "pipe", "pipe"] },
);

let buffered = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    buffered += chunk.toString();
    process.stdout.write(chunk);
  });
}

child.on("error", (cause) => {
  process.stderr.write(`i18n compile: failed to start lingui — ${cause}\n`);
  process.exit(1);
});

child.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  if (/Compilation error/.test(buffered)) {
    process.stderr.write(
      "\ni18n compile: parse error in a catalog — failing.\n",
    );
    process.exit(1);
  }
  // Only static-import consumers (core's admin bar resolves catalogs
  // through the package `exports` map) need declarations. Glob
  // consumers (admin, plugins) infer the type from the `.mjs`
  // directly, and a stub would clash with lingui's `Messages` — so
  // emit `.d.mts` only when `--dts` is passed.
  if (!process.argv.includes("--dts")) return;
  try {
    for (const file of readdirSync(localesDir)) {
      if (!file.endsWith(".mjs")) continue;
      const dts = join(localesDir, file.replace(/\.mjs$/, ".d.mts"));
      writeFileSync(dts, CATALOG_DTS);
    }
  } catch (cause) {
    process.stderr.write(`i18n compile: could not emit .d.mts — ${cause}\n`);
    process.exit(1);
  }
});
