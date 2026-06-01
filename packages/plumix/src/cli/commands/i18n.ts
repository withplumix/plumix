import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { CommandDefinition } from "@plumix/core";
import { CliError, spawnInherit } from "@plumix/core";

const SUPPORTED = ["extract", "compile"] as const;

export const i18nCommand: CommandDefinition = {
  describe: "Extract translation strings (.po) and compile to runtime catalogs",
  async run(ctx) {
    const sub = ctx.argv[0];
    if (sub === undefined) {
      throw CliError.unknownSubcommand({
        command: "i18n",
        subcommand: "(missing)",
        supported: [...SUPPORTED],
      });
    }
    if (sub !== "extract" && sub !== "compile") {
      throw CliError.unknownSubcommand({
        command: "i18n",
        subcommand: sub,
        supported: [...SUPPORTED],
      });
    }
    const bin = i18nDeps.resolveLinguiCliBin(ctx.cwd);
    if (bin === null) {
      throw CliError.unknownSubcommand({
        command: "i18n",
        subcommand: `${sub} (@lingui/cli not found)`,
        supported: [...SUPPORTED],
      });
    }
    // Mirror migrate.ts: spawn `process.execPath` with a resolved
    // binary path so the command works on Windows (where `npx`/`lingui`
    // are .cmd shims that `spawn` without `shell: true` can't find).
    await i18nDeps.spawnInherit(
      process.execPath,
      [bin, sub, ...ctx.argv.slice(1)],
      { cwd: ctx.cwd },
    );
  },
};

function resolveLinguiCliBin(cwd: string): string | null {
  // Consumer's own @lingui/cli takes precedence (so they can pin a
  // version); falls back to the one bundled with plumix.
  const bases = [
    pathToFileURL(resolve(cwd, "package.json")).href,
    import.meta.url,
  ];
  for (const base of bases) {
    try {
      const main = createRequire(base).resolve("@lingui/cli");
      return resolve(dirname(main), "lingui.js");
    } catch {
      // try the next base
    }
  }
  return null;
}

// Mutable seam for tests.
export const i18nDeps = {
  resolveLinguiCliBin,
  spawnInherit,
};
