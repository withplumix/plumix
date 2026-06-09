import { glob, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ScaffoldError } from "./errors.js";

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

// `@plumix/typescript-config` is a private dev-only workspace package,
// never published to npm. Scaffolded projects get a self-contained
// tsconfig instead, so the dependency is dropped entirely.
const PRIVATE_DEV_PACKAGE = "@plumix/typescript-config";

export interface CatalogContext {
  /** Default `catalog:` table from pnpm-workspace.yaml (name → range). */
  readonly catalog: Record<string, string>;
  /** Every workspace package's own version (name → version). */
  readonly workspaceVersions: Record<string, string>;
}

export const EMPTY_CATALOG_CONTEXT: CatalogContext = {
  catalog: {},
  workspaceVersions: {},
};

export function resolveDeps(
  deps: Record<string, string> | undefined,
  ctx: CatalogContext,
): Record<string, string> | undefined {
  if (!deps) return deps;
  const out: Record<string, string> = {};
  for (const [name, range] of Object.entries(deps)) {
    if (name === PRIVATE_DEV_PACKAGE) continue;
    if (range.startsWith("workspace:")) {
      const version = ctx.workspaceVersions[name];
      if (!version) {
        throw ScaffoldError.workspaceVersionMissing({ packageName: name });
      }
      out[name] = `^${version}`;
      continue;
    }
    if (range.startsWith("catalog:")) {
      const resolved = ctx.catalog[name];
      if (!resolved) {
        throw ScaffoldError.catalogResolutionMissing({ catalogName: name });
      }
      out[name] = resolved;
      continue;
    }
    out[name] = range;
  }
  return out;
}

/**
 * Resolve a `package.json` file's dependency protocols in place,
 * applying an optional `patch` (e.g. renaming the package) first. The
 * 2-space indent + trailing newline matches the template's other JSON;
 * `JSON.stringify` rewrites the whole file, which is fine because these
 * are plain JSON we control — no comments or key ordering to preserve.
 */
export async function rewritePackageJsonFile(
  pkgPath: string,
  ctx: CatalogContext,
  patch?: (pkg: PackageJson) => void,
): Promise<void> {
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as PackageJson;
  patch?.(pkg);
  const deps = resolveDeps(pkg.dependencies, ctx);
  const devDeps = resolveDeps(pkg.devDependencies, ctx);
  if (deps) pkg.dependencies = deps;
  if (devDeps) pkg.devDependencies = devDeps;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

/**
 * Read the default catalog and every workspace package's version from
 * the monorepo at `repoRoot`. Used at scaffold time (dev path) and at
 * `prepack` time to bake concrete versions into the published snapshot.
 */
export async function loadCatalogContext(
  repoRoot: string,
): Promise<CatalogContext> {
  const yaml = await readFile(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
  return {
    catalog: parseWorkspaceCatalog(yaml),
    workspaceVersions: await collectWorkspaceVersions(repoRoot, yaml),
  };
}

async function collectWorkspaceVersions(
  repoRoot: string,
  yaml: string,
): Promise<Record<string, string>> {
  const patterns = parseWorkspacePackages(yaml).map((p) => `${p}/package.json`);
  const out: Record<string, string> = {};
  for await (const rel of glob(patterns, { cwd: repoRoot })) {
    const raw = await readFile(join(repoRoot, rel), "utf8");
    const pkg = JSON.parse(raw) as { name?: string; version?: string };
    if (pkg.name && pkg.version) out[pkg.name] = pkg.version;
  }
  return out;
}

/** Parse the `packages:` glob list out of pnpm-workspace.yaml. */
function parseWorkspacePackages(yaml: string): string[] {
  const out: string[] = [];
  for (const line of blockLines(yaml, "packages:")) {
    const match = /^\s+-\s*"?([^"\s]+)"?\s*$/.exec(line);
    if (match?.[1]) out.push(match[1]);
  }
  return out;
}

/**
 * Parse the top-level `catalog:` map out of pnpm-workspace.yaml. The
 * format is stable (we control it) so a tiny line-scanner is enough,
 * keeping a YAML parser out of the scaffolder's dependency surface.
 */
export function parseWorkspaceCatalog(yaml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of blockLines(yaml, "catalog:")) {
    const match = /^\s+"?([^":\s]+)"?\s*:\s*(\S+)\s*$/.exec(line);
    const [, name, version] = match ?? [];
    if (name && version) out[name] = version;
  }
  return out;
}

// The block ends at the next top-level key (a non-indented line);
// comments and blank lines inside it are left for the caller's regex.
function* blockLines(yaml: string, key: string): Generator<string> {
  let inBlock = false;
  for (const line of yaml.split("\n")) {
    if (line === key) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("#"))
      break;
    yield line;
  }
}
