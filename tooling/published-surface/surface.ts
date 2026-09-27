import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

import { SHARED_ADMIN_RUNTIME_SPECIFIERS } from "@plumix/core/admin";

import {
  CURATED_REEXPORT,
  subpathsMatching,
} from "../../packages/plumix/test/facade-entries.js";

export const REPO_ROOT = resolve(import.meta.dirname, "../..");

// Their consumer surface is reached through `plumix`, which the façade guards
// own (the umbrella rule).
const INTERNAL = new Set([
  "@plumix/core",
  "@plumix/blocks",
  "@plumix/admin",
  "@plumix/admin-editor",
  "@plumix/admin-ui",
]);

// The `plumix` subpaths another guard already owns: the curated re-exports
// (`facade-curated.test.ts`), the shared admin runtime shims (core's roster,
// `shim-drift.test.ts`) and a whole-package passthrough.
const OWNED_ELSEWHERE = new Set([
  ...subpathsMatching(CURATED_REEXPORT),
  ...Object.values(SHARED_ADMIN_RUNTIME_SPECIFIERS).map((specifier) =>
    specifier.replace(/^plumix\//, "./"),
  ),
  ...subpathsMatching(
    /^\s*(?:\/\*[\s\S]*?\*\/\s*)?export\s+\*\s+from\s+["']@plumix\/[^"']+["'];?\s*$/,
  ),
]);

type ExportTarget = string | { readonly types?: string } | null;

interface Manifest {
  readonly name: string;
  readonly private?: boolean;
  readonly exports?: Readonly<Record<string, ExportTarget>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

export interface CoveredPackage {
  readonly name: string;
  readonly dir: string;
  readonly hasExportsMap: boolean;
  /** Subpath → its published declaration file. */
  readonly subpaths: ReadonlyMap<string, string>;
}

function readManifest(file: string): Manifest {
  return JSON.parse(readFileSync(file, "utf8")) as Manifest;
}

function workspacePatterns(): string[] {
  const yaml = readFileSync(resolve(REPO_ROOT, "pnpm-workspace.yaml"), "utf8");
  const block = /^packages:\n((?:\s+-\s+.*\n)+)/m.exec(yaml)?.[1] ?? "";
  return [...block.matchAll(/-\s+["']?([^"'\n]+)["']?/g)].flatMap((m) =>
    m[1] === undefined ? [] : [m[1]],
  );
}

function coveredSubpaths(manifest: Manifest, dir: string): Map<string, string> {
  const subpaths = new Map<string, string>();
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    if (subpath === "./package.json" || subpath.includes("*")) continue;
    if (manifest.name === "plumix" && OWNED_ELSEWHERE.has(subpath)) continue;
    const types = typeof target === "string" ? target : target?.types;
    if (types === undefined)
      throw new Error(`${manifest.name} ${subpath}: no types`);
    subpaths.set(subpath, resolve(dir, types));
  }
  return subpaths;
}

export function coveredPackages(): CoveredPackage[] {
  return workspacePatterns()
    .flatMap((pattern) =>
      globSync(`${pattern}/package.json`, { cwd: REPO_ROOT }),
    )
    .map((file) => ({
      dir: dirname(resolve(REPO_ROOT, file)),
      manifest: readManifest(resolve(REPO_ROOT, file)),
    }))
    .filter(
      ({ manifest }) =>
        manifest.private !== true && !INTERNAL.has(manifest.name),
    )
    .map(({ dir, manifest }) => ({
      name: manifest.name,
      dir,
      hasExportsMap: manifest.exports !== undefined,
      subpaths: coveredSubpaths(manifest, dir),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function ownDevDependencies(): string[] {
  return Object.keys(
    readManifest(resolve(import.meta.dirname, "package.json"))
      .devDependencies ?? {},
  );
}

/**
 * Every name each declaration file exports, values and types together, as
 * a consumer's compiler resolves them.
 */
export function exportsOf(files: readonly string[]): Map<string, string[]> {
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  });
  const checker = program.getTypeChecker();
  return new Map(
    files.map((file) => {
      const source = program.getSourceFile(file);
      if (source === undefined) throw new Error(`${file} is not built`);
      const module = checker.getSymbolAtLocation(source);
      const names = module
        ? checker.getExportsOfModule(module).map((symbol) => symbol.name)
        : [];
      return [file, names.sort()];
    }),
  );
}
