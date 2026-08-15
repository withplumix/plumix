import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// The `@plumix/core` root barrel statically imports `context/stores.ts`,
// which imports `node:async_hooks`. esbuild resolves imports before it
// tree-shakes, so pulling the barrel into an admin / editor / playground
// (browser) bundle fails to resolve `node:async_hooks` — regardless of
// core's `sideEffects: false`. Façade entrypoints that land in a browser
// bundle must therefore re-export from a narrow `@plumix/core/<subpath>`
// (e.g. `plumix/i18n` → `@plumix/core/i18n`), never the bare barrel.
//
// This guard turns that rule — previously recorded only in a comment on
// `i18n/index.ts` — into an enforced invariant. Every subpath export is
// scanned, and a *value* (non-type) import or re-export of the bare
// `@plumix/core` barrel fails the build unless the entry is listed in
// `BARREL_ALLOWED` (entries that only run in Node / build contexts, each
// with a rationale). A new browser content subpath that lazily does
// `export * from "@plumix/core"` is caught here rather than by a cryptic
// esbuild "could not resolve node:async_hooks" at a consumer's build time.
//
// Scope: a textual scan of the entry file's own import/export sources. The
// façade entries are thin re-export modules, so this is enough — none reach
// the barrel through a local relative import.

const here = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(
  readFileSync(resolve(here, "..", "package.json"), "utf8"),
) as { exports: Record<string, { default?: string }> };

// Subpath exports whose entry runs only server / build-side (Node), where
// importing the `@plumix/core` barrel is safe. Everything else must reach
// core through a `@plumix/core/<subpath>`.
const BARREL_ALLOWED: Readonly<Record<string, string>> = {
  ".": "the full server surface (worker + config)",
  "./plugin": "plugin config is authored and loaded server-side",
  "./theme": "defineTheme / defineTemplate run at config / SSR time",
  "./vite": "the Vite plugin runs in Node at build time",
  // `getRuntime` (re-exported from ./runtime.js) is browser-facing, but the
  // *values* this entry pulls from the barrel — SHARED_ADMIN_RUNTIME_SPECIFIERS
  // and adminRuntimeShimSlug — are build-time constants, and no browser /
  // plugin chunk imports `plumix/admin` (the index) today. If one ever does,
  // move those constants onto a browser-safe `@plumix/core` subpath rather
  // than widening this allowlist.
  "./admin": "build-time runtime-alias constants; not browser-bundled today",
};

// `./dist/admin/react.js` -> `<pkg>/src/admin/react.{ts,tsx}` (whichever exists)
function entrySrcPath(distDefault: string): string | undefined {
  const base = distDefault.replace(/^\.\/dist\//, "").replace(/\.js$/, "");
  for (const ext of [".ts", ".tsx"]) {
    const candidate = resolve(here, base + ext);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

// A value (runtime) import or re-export whose source is exactly
// "@plumix/core". `import type` / `export type` are erased by the compiler
// and never pull the barrel, so they are exempt.
function importsBarrelAsValue(source: string): boolean {
  const statement =
    /\b(import|export)(\s+type)?\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^{}]*\}|[\w$]+)\s+from\s+["']@plumix\/core["']/g;
  for (const match of source.matchAll(statement)) {
    const isTypeOnly = match[2] !== undefined;
    if (!isTypeOnly) return true;
  }
  return false;
}

const flagged: string[] = [];
for (const [subpath, spec] of Object.entries(pkg.exports)) {
  if (spec.default === undefined) continue;
  const src = entrySrcPath(spec.default);
  if (src === undefined) continue;
  if (importsBarrelAsValue(readFileSync(src, "utf8"))) flagged.push(subpath);
}

test("browser façade subpaths never re-export the @plumix/core barrel", () => {
  const disallowed = flagged.filter((subpath) => !(subpath in BARREL_ALLOWED));
  expect(
    disallowed,
    `These subpath exports import the bare @plumix/core barrel, which drags ` +
      `node:async_hooks into browser bundles: ${disallowed.join(", ")}. Re-export ` +
      `from a @plumix/core/<subpath> instead, or add to BARREL_ALLOWED with a rationale.`,
  ).toEqual([]);
});

test("no stale BARREL_ALLOWED entry (every allowed entry still imports the barrel)", () => {
  const stale = Object.keys(BARREL_ALLOWED).filter(
    (subpath) => !flagged.includes(subpath),
  );
  expect(stale).toEqual([]);
});
