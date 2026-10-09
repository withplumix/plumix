#!/usr/bin/env node
// Thin bin wrapper. Committed so pnpm can create the `plumix` symlink at
// install time, before `dist/cli/index.js` exists. Delegates to the built
// CLI module, which is present by the time the user invokes `plumix`.
const argv = process.argv.slice(2);

// `i18n compile` is answered before `dist/` is touched: a package compiles
// its catalogs ahead of its own build, so it must not wait on plumix's.
if (argv[0] === "i18n" && argv[1] === "compile") {
  const { runCompileCatalogs } = await import("@plumix/core/i18n-compile");
  await runCompileCatalogs(process.cwd(), argv.slice(2));
} else {
  const { exitWithError, run } = await import("../dist/cli/index.js");
  run(argv).catch(exitWithError);
}
