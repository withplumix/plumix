#!/usr/bin/env node
// Internal entry for the packages `plumix` depends on (blocks, core, admin,
// admin-editor), which can't call `plumix i18n compile` without a cycle.
// Run from a package root; `--dts` is consumed here and the rest reach
// `lingui compile`.
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { compileCatalogs } from "../i18n-compile/index.mjs";

const cwd = process.cwd();
const argv = process.argv.slice(2);

const result = await compileCatalogs({
  cwd,
  linguiBin: resolveLinguiBin(),
  args: argv.filter((arg) => arg !== "--dts"),
  dts: argv.includes("--dts"),
});
if (!result.ok) {
  process.stderr.write(`\ni18n compile: ${result.reason} — failing.\n`);
  process.exitCode = 1;
}

// The calling package's own `@lingui/cli` first, so it can pin a version;
// core's second.
function resolveLinguiBin() {
  for (const base of [
    pathToFileURL(resolve(cwd, "package.json")).href,
    import.meta.url,
  ]) {
    const require = createRequire(base);
    try {
      return join(dirname(require.resolve("@lingui/cli")), "lingui.js");
    } catch {
      // try the next base
    }
  }
  process.stderr.write("i18n compile: @lingui/cli not found\n");
  process.exit(1);
}
