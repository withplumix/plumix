import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { CommandContext, CommandDefinition } from "@plumix/core";
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
    const rest = ctx.argv.slice(1);
    // `--check` is plumix's own flag (slice 7 CI gate). Snapshot the
    // `.po` files, run extract, compare active msgid sets, restore — so
    // a failed gate exits non-zero with a clean working tree.
    if (sub === "extract" && rest.includes("--check")) {
      await runExtractCheck(ctx, bin, rest);
      return;
    }
    // Mirror migrate.ts: spawn `process.execPath` with a resolved bin
    // path so the command works on Windows (where `lingui`/`npx` are
    // .cmd shims that `spawn` without `shell: true` can't find).
    await i18nDeps.spawnInherit(process.execPath, [bin, sub, ...rest], {
      cwd: ctx.cwd,
    });
  },
};

async function runExtractCheck(
  ctx: CommandContext,
  bin: string,
  rest: readonly string[],
): Promise<void> {
  const localesDir = resolve(ctx.cwd, "locales");
  const snapshot = new Map<string, string>();
  for (const path of listPoFiles(localesDir)) {
    snapshot.set(path, readFileSync(path, "utf8"));
  }
  const knownIds = new Set<string>();
  for (const content of snapshot.values()) {
    for (const id of activeMsgids(content)) knownIds.add(id);
  }
  // Forward `--clean` so source-side deletions also count as drift: a
  // msgid removed from source becomes `#~ obsolete` in .po, which
  // `activeMsgids` filters out — the resulting "missing from active
  // set" surfaces in the drift list. INVARIANT: every msgid in the
  // committed catalog must be reachable from extractor-visible source
  // (a Lingui macro call or `<Trans>` JSX). Hand-authoring a msgid
  // that isn't reachable from extractor input would cause `--clean`
  // to demote it on every gate run.
  const forwarded = ["--clean", ...rest.filter((a) => a !== "--check")];
  try {
    await i18nDeps.spawnInherit(
      process.execPath,
      [bin, "extract", ...forwarded],
      { cwd: ctx.cwd },
    );
    const introduced = new Set<string>();
    const removed = new Set<string>();
    const afterIds = new Set<string>();
    for (const path of listPoFiles(localesDir)) {
      for (const id of activeMsgids(readFileSync(path, "utf8"))) {
        afterIds.add(id);
        if (!knownIds.has(id)) introduced.add(id);
      }
    }
    for (const id of knownIds) {
      if (!afterIds.has(id)) removed.add(id);
    }
    if (introduced.size > 0 || removed.size > 0) {
      throw CliError.i18nCheckDrift({
        ids: [
          ...[...introduced].sort().map((id) => `+ ${id}`),
          ...[...removed].sort().map((id) => `- ${id}`),
        ],
      });
    }
  } finally {
    for (const [path, content] of snapshot) writeFileSync(path, content);
    for (const path of listPoFiles(localesDir)) {
      if (!snapshot.has(path)) rmSync(path);
    }
  }
}

/** Extract active (non-obsolete) msgid values from a .po file. Handles
 *  the multi-line / continuation form that `pofile-ts` folds long
 *  strings into (msgid "" followed by "..." continuation lines) so the
 *  gate doesn't silently miss folded entries on Windows (CRLF) or for
 *  long explicit-ids past the 80-char default fold threshold. */
function activeMsgids(content: string): readonly string[] {
  const ids: string[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    // `#~` marks obsolete; not gated.
    if (line.startsWith("#~")) continue;
    if (!line.startsWith("msgid ")) continue;
    // Collect the `"..."` payload from this line plus every following
    // continuation line that starts with `"`.
    let buf = line.slice("msgid ".length);
    let next = lines[i + 1];
    while (next?.startsWith('"') === true) {
      buf += next;
      i += 1;
      next = lines[i + 1];
    }
    const id = decodeQuoted(buf);
    if (id !== "") ids.push(id);
  }
  return ids;
}

/** Decode one or more concatenated `"..."` segments from a .po line.
 *  `pofile-ts` writes plain double-quoted strings with backslash
 *  escapes for `\n`, `\t`, `\\`, `\"`. */
function decodeQuoted(buf: string): string {
  const segments = buf.match(/"((?:\\.|[^"\\])*)"/g);
  if (!segments) return "";
  return segments.map((s) => s.slice(1, -1).replace(/\\(.)/g, "$1")).join("");
}

function listPoFiles(dir: string): readonly string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(".po"))
      .map((d) => join(dir, d.name));
  } catch {
    return [];
  }
}

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
