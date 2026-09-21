import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Shared by the façade guards in `src/`. It lives in `test/` because
// `tsconfig.build.json` excludes it; a helper under `src/` would ship in `dist/`.
export const packageDir = resolve(import.meta.dirname, "..");

interface ExportSpec {
  readonly types: string;
  readonly default: string;
}

const pkg = JSON.parse(
  readFileSync(resolve(packageDir, "package.json"), "utf8"),
) as { exports: Record<string, ExportSpec> };

function exportOf(subpath: string): ExportSpec {
  const spec = pkg.exports[subpath];
  if (spec === undefined) throw new Error(`no ${subpath} in the exports map`);
  return spec;
}

const entrySources = Object.keys(pkg.exports).map((subpath) => {
  const file = exportOf(subpath)
    .default.replace(/^\.\/dist\//, "src/")
    .replace(/\.js$/, ".ts");
  return [subpath, readFileSync(resolve(packageDir, file), "utf8")] as const;
});

// A subpath curates when its entry re-exports named values from an internal
// package.
export const CURATED_REEXPORT = /export\s+\{[^}]*\}\s+from\s+["']@plumix\//;

export function subpathsMatching(pattern: RegExp): string[] {
  return entrySources
    .filter(([, source]) => pattern.test(source))
    .map(([subpath]) => subpath)
    .sort();
}

export function declarationOf(subpath: string): string {
  return resolve(packageDir, exportOf(subpath).types);
}
