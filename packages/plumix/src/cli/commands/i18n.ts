import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { CommandContext, CommandDefinition } from "@plumix/core";
import { CliError, spawnInherit } from "@plumix/core";

import { report } from "../report.js";

const SUPPORTED = ["extract", "compile", "init", "verify"] as const;
export const LINGUI_DEP_RANGE = "^6.2.0";

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
    if (sub === "init") {
      runInit(ctx);
      return;
    }
    if (sub === "verify") {
      runVerify(ctx);
      return;
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

/** Scaffold the i18n config + scripts at the package root. Each target
 *  is idempotent (skip-if-exists); package.json gets a non-destructive
 *  merge so pre-existing scripts/devDeps survive. Errors loudly if
 *  package.json is missing or malformed rather than silently creating
 *  one — `init` is a "set up i18n in this package" command, not "make
 *  a package." */
function runInit(ctx: CommandContext): void {
  report.info("Plumix i18n init");

  const configPath = resolve(ctx.cwd, "lingui.config.ts");
  const wroteConfig = !existsSync(configPath);
  if (wroteConfig) writeFileSync(configPath, LINGUI_CONFIG_TEMPLATE);
  report.info(
    `  lingui.config.ts:                ${wroteConfig ? "created" : "exists, skipped"}`,
  );

  const scriptDir = resolve(ctx.cwd, "scripts");
  const scriptPath = resolve(scriptDir, "i18n-compile-check.mjs");
  const wroteScript = !existsSync(scriptPath);
  if (wroteScript) {
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(scriptPath, COMPILE_CHECK_TEMPLATE);
  }
  report.info(
    `  scripts/i18n-compile-check.mjs:  ${wroteScript ? "created" : "exists, skipped"}`,
  );

  const pkgPath = resolve(ctx.cwd, "package.json");
  const pkg = readRequiredPackageJson(pkgPath, ctx.cwd);
  const { merged, changed } = mergePackageJson(pkg);
  if (changed) {
    writeFileSync(pkgPath, `${JSON.stringify(merged, null, 2)}\n`);
  }
  report.info(
    `  package.json:                    ${changed ? "patched" : "no changes"}`,
  );
}

const LINGUI_CONFIG_TEMPLATE = `import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en"],
  catalogs: [
    {
      path: "<rootDir>/locales/{locale}",
      include: ["src"],
    },
  ],
  format: formatter({ lineNumbers: false }),
});
`;

// Cloned from packages/admin/scripts/i18n-compile-check.mjs — the
// canonical contract: spawn \`lingui compile\` (no --strict), grep
// stdout for "Compilation error", fail on parse errors but let missing
// translations fall back silently.
const COMPILE_CHECK_TEMPLATE = `#!/usr/bin/env node
// Lingui's \`compile --strict\` fails on BOTH parse errors AND missing
// translations. Most projects want parse errors to fail (ICU brace
// mistakes etc.) but missing translations to fall back silently — the
// source locale is ground truth and per-locale seeding is a separate
// track.
//
// Spawn \`lingui compile\` (no --strict), stream its output, then exit
// 1 if "Compilation error" appears anywhere — that's the marker for a
// parse failure regardless of strict mode.
import { spawn } from "node:child_process";

const child = spawn(
  "pnpm",
  ["exec", "lingui", "compile", "--namespace", "es"],
  { stdio: ["inherit", "pipe", "pipe"] },
);

let buffered = "";
const tee = (stream, into) => {
  stream.on("data", (chunk) => {
    buffered += chunk.toString();
    into.write(chunk);
  });
};
tee(child.stdout, process.stdout);
tee(child.stderr, process.stderr);

child.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  if (/Compilation error/.test(buffered)) {
    process.stderr.write(
      "\\ni18n-compile-check: parse error detected — failing build.\\n",
    );
    process.exit(1);
  }
});
`;

interface PackageJsonShape {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

/** Read package.json, raising a CliError on missing or malformed input.
 *  Silent fallback would clobber a user's broken file with a synthetic
 *  one or scaffold into a directory that isn't actually a package. */
function readRequiredPackageJson(
  pkgPath: string,
  cwd: string,
): PackageJsonShape {
  let raw: string;
  try {
    raw = readFileSync(pkgPath, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      throw CliError.i18nInitNoPackageJson({ cwd });
    }
    throw cause;
  }
  try {
    return JSON.parse(raw) as PackageJsonShape;
  } catch (cause) {
    throw CliError.i18nInitInvalidPackageJson({ cwd, cause });
  }
}

/** Non-destructive merge: only the new keys we'd add are introduced,
 *  pre-existing user values win on collision, and `changed` is true
 *  iff at least one key would actually be inserted. Comparing inserted
 *  keys directly avoids the JSON-stringify reorder trap that would
 *  rewrite the file for cosmetic key-order changes. */
function mergePackageJson(pkg: PackageJsonShape): {
  merged: PackageJsonShape;
  changed: boolean;
} {
  const newScripts: Record<string, string> = {
    "i18n:extract": "lingui extract",
    "i18n:compile": "lingui compile --namespace es",
    // `verify` is the source↔catalog drift gate — works for both
    // lingui-extracted catalogs and the hand-authored manifest pattern
    // plumix's own plugins use. Catches JSX `<Trans id="..." message="...">`
    // and object-literal `{ id, message }` descriptors uniformly.
    "i18n:check": "plumix i18n verify",
  };
  const newDeps: Record<string, string> = {
    "@lingui/cli": LINGUI_DEP_RANGE,
    "@lingui/format-po": LINGUI_DEP_RANGE,
  };
  const scripts: Record<string, string> = { ...newScripts, ...pkg.scripts };
  const devDependencies: Record<string, string> = {
    ...newDeps,
    ...pkg.devDependencies,
  };
  const changed =
    Object.keys(newScripts).some((k) => !(k in (pkg.scripts ?? {}))) ||
    Object.keys(newDeps).some((k) => !(k in (pkg.devDependencies ?? {})));
  return { merged: { ...pkg, scripts, devDependencies }, changed };
}

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

/** Drift gate for hand-authored plugin catalogs. Unlike `extract --check`
 *  (which assumes the Lingui extractor sees every descriptor), `verify`
 *  scans source for any `{ id, message }`-shape literal — so descriptors
 *  wrapped in `withContext(...)` or declared as plain manifest fields
 *  count too. Exits non-zero with a sorted drift report when source and
 *  `locales/en.po` disagree.
 *
 *  `--src <dir>` (repeatable) narrows the scan to specific directories
 *  for packages whose catalogs own only part of their source tree —
 *  core's po carries the SSR admin-bar strings, while its adminNav
 *  descriptors are translated by admin's catalogs. */
function runVerify(ctx: CommandContext): void {
  const localesDir = resolve(ctx.cwd, "locales");
  const srcDirs = verifySrcDirs(ctx);
  const sourceIds = new Set<string>();
  for (const srcDir of srcDirs) {
    for (const file of listSourceFiles(srcDir)) {
      for (const id of sourceDescriptorIds(readFileSync(file, "utf8"))) {
        sourceIds.add(id);
      }
    }
  }
  const catalogIds: string[] = [];
  for (const path of listPoFiles(localesDir)) {
    for (const id of activeMsgids(readFileSync(path, "utf8"))) {
      catalogIds.push(id);
    }
  }
  const drift = computeIdDrift(sourceIds, catalogIds);
  if (drift.missingInCatalog.length > 0 || drift.orphanedInCatalog.length > 0) {
    throw CliError.i18nVerifyDrift(drift);
  }
}

function verifySrcDirs(ctx: CommandContext): readonly string[] {
  const dirs: string[] = [];
  const rest = ctx.argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--src") {
      const dir = rest[i + 1];
      if (dir === undefined || dir.startsWith("--")) {
        throw CliError.unknownSubcommand({
          command: "i18n",
          subcommand: "verify --src (missing directory)",
          supported: [...SUPPORTED],
        });
      }
      dirs.push(resolve(ctx.cwd, dir));
      i++;
    }
  }
  return dirs.length > 0 ? dirs : [resolve(ctx.cwd, "src")];
}

function listSourceFiles(dir: string): readonly string[] {
  const out: string[] = [];
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        out.push(...listSourceFiles(full));
      } else if (
        e.isFile() &&
        (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) &&
        // Test files often declare fixture descriptors (`{ id: "test.x",
        // message: "fixture" }`) that shouldn't count as shipped strings.
        // Gate scope is production source.
        !e.name.endsWith(".test.ts") &&
        !e.name.endsWith(".test.tsx")
      ) {
        out.push(full);
      }
    }
  } catch {
    // Missing src/ dir is fine — a package may ship catalogs without code yet.
  }
  return out;
}

/** Sorted so CI failures read deterministically. `missingInCatalog`
 *  blocks translators from seeing the string; `orphanedInCatalog` is
 *  dead translation work. */
export function computeIdDrift(
  sourceIds: ReadonlySet<string>,
  catalogIds: readonly string[],
): { missingInCatalog: string[]; orphanedInCatalog: string[] } {
  const catalog = new Set(catalogIds);
  const missingInCatalog: string[] = [];
  const orphanedInCatalog: string[] = [];
  for (const id of sourceIds) if (!catalog.has(id)) missingInCatalog.push(id);
  for (const id of catalog) if (!sourceIds.has(id)) orphanedInCatalog.push(id);
  return {
    missingInCatalog: missingInCatalog.sort(),
    orphanedInCatalog: orphanedInCatalog.sort(),
  };
}

/** Finds `{ id: "...", message: "..." }`-shaped descriptor literals
 *  (covers `defineMessage`, `withContext`, manifest objects) and
 *  `<Trans id="..." message="..." />` JSX. `id` and `message` must be
 *  siblings at the same nesting depth — a nav-group descriptor like
 *  `{ id: "x", label: { id, message } }` doesn't count. Dynamic ids
 *  (`id: prefix + ".x"`) are ignored — neither the extractor nor the
 *  catalog can represent them. */
export function sourceDescriptorIds(text: string): ReadonlySet<string> {
  const ids = new Set<string>();
  // Object-literal form: `id: "X"` — accept only when the enclosing
  // `{...}` has `message:` at the SAME nesting depth (a sibling `id:`
  // next to a nested `label: { id, message }` is a nav-group descriptor,
  // not a translation descriptor).
  const objRe = /\bid:\s*["']([^"'\n]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(text)) !== null) {
    if (hasSiblingMessageKey(text, m.index)) ids.add(m[1] ?? "");
  }
  // JSX-attribute form: `id="X"` inside a `<Trans ... message="..." />`
  // (or `<Trans ... message={...} />`) tag, possibly across multiple
  // lines. The tag begins with the most recent `<` to the left and ends
  // at the next `>` (no nested elements inside an opening tag).
  const jsxRe = /\bid=["']([^"'\n]+)["']/g;
  while ((m = jsxRe.exec(text)) !== null) {
    const tag = enclosingJsxTag(text, m.index);
    if (tag && /\bmessage[:=]/.test(tag)) ids.add(m[1] ?? "");
  }
  ids.delete("");
  return ids;
}

function hasSiblingMessageKey(text: string, pos: number): boolean {
  // Find the nearest unbalanced `{` to the left of pos.
  let depth = 0;
  let start = -1;
  for (let i = pos; i >= 0; i--) {
    const c = text[i];
    if (c === "}") depth += 1;
    else if (c === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth -= 1;
    }
  }
  if (start === -1) return false;
  // Scan forward from `start`, tracking nested `{...}` depth. Match
  // `message:` only when depth === 1 (sibling level of the `{` body).
  depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return false;
    } else if (
      depth === 1 &&
      text.startsWith("message", i) &&
      /\s*:/.test(text.slice(i + "message".length))
    ) {
      return true;
    }
  }
  return false;
}

/** Opening JSX tags don't nest, so a simple `<...>` window is enough. */
function enclosingJsxTag(text: string, pos: number): string | null {
  const lt = text.lastIndexOf("<", pos);
  if (lt === -1) return null;
  const gt = text.indexOf(">", pos);
  if (gt === -1) return null;
  // Reject the case where another tag closed between `lt` and `pos`.
  if (text.lastIndexOf(">", pos - 1) > lt) return null;
  return text.slice(lt, gt + 1);
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
