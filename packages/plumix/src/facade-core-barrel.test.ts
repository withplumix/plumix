import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// The core barrel imports `node:async_hooks`, which esbuild resolves before
// tree-shaking, so a browser-bound façade entry must re-export from a narrow
// subpath. A textual scan suffices: entries are thin re-exports.

const here = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(
  readFileSync(resolve(here, "..", "package.json"), "utf8"),
) as { exports: Record<string, { default?: string }> };

/**
 * Subpath exports whose entry runs only server / build-side (Node), where
 * importing the `@plumix/core` barrel is safe. Everything else must reach
 * core through a `@plumix/core/<subpath>`.
 */
const BARREL_ALLOWED: Readonly<Record<string, string>> = {
  ".": "the full server surface (worker + config)",
  "./plugin": "plugin config is authored and loaded server-side",
  "./theme": "defineTheme / defineTemplate run at config / SSR time",
  "./runtime": "a runtime adapter composes the app server-side",
  "./auth": "authenticators and access policies run server-side",
  "./vite": "the Vite plugin runs in Node at build time",
  // `./admin` is intentionally absent: it's a browser entry held to the same
  // rule as the rest, reaching core through the `@plumix/core/admin` subpath.
};

/**
 * `./dist/admin/react.js` -> `<pkg>/src/admin/react.{ts,tsx}` (whichever
 * exists)
 */
function entrySrcPath(distDefault: string): string | undefined {
  const base = distDefault.replace(/^\.\/dist\//, "").replace(/\.js$/, "");
  for (const ext of [".ts", ".tsx"]) {
    const candidate = resolve(here, base + ext);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * A value (runtime) import or re-export whose source is exactly
 * "@plumix/core". `import type` / `export type` are erased by the compiler
 * and never pull the barrel, so they are exempt.
 */
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
