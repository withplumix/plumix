import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { PackageManager } from "./package-manager.js";
import { ScaffoldError } from "./errors.js";

export interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  // Not JsonObject: same reason as `WranglerPatch`. Nothing here reads a key
  // this interface does not name; the signature keeps the untouched half of
  // the manifest around across a rewrite.
  [key: string]: unknown;
}

// `@plumix/typescript-config` is a private dev-only workspace package,
// never published to npm. Scaffolded projects get a self-contained
// tsconfig instead, so the dependency is dropped entirely.
const PRIVATE_DEV_PACKAGE = "@plumix/typescript-config";

export interface CatalogContext {
  /** Default `catalog:` table from pnpm-workspace.yaml (name → range). */
  readonly catalog: Record<string, string>;
  /** Named `catalogs:` tables, keyed by catalog name (e.g. `react`). */
  readonly catalogs?: Record<string, Record<string, string>>;
  /** Every workspace package's own version (name → version). */
  readonly workspaceVersions: Record<string, string>;
  /**
   * The exact version the repo pins for a package manager a runtime installs
   * with, written to the project's `packageManager` field.
   */
  readonly packageManagerVersions?: Readonly<
    Partial<Record<PackageManager, string>>
  >;
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
      const catalogName = range.slice("catalog:".length);
      const table = catalogName ? ctx.catalogs?.[catalogName] : ctx.catalog;
      const resolved = table?.[name];
      if (!resolved) {
        throw ScaffoldError.catalogResolutionMissing({
          dependency: name,
          catalog: catalogName || "default",
        });
      }
      out[name] = resolved;
      continue;
    }
    out[name] = range;
  }
  return out;
}

export async function loadCatalogContext(
  repoRoot: string,
): Promise<CatalogContext> {
  const yaml = await readFile(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
  return {
    catalog: parseWorkspaceCatalog(yaml),
    catalogs: parseNamedCatalogs(yaml),
    workspaceVersions: await collectWorkspaceVersions(repoRoot, yaml),
    // The same file CI and contributors install Bun from, so a project runs
    // the Bun the runtime was tested on.
    packageManagerVersions: {
      bun: (await readFile(join(repoRoot, ".bun-version"), "utf8")).trim(),
    },
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

function parseWorkspacePackages(yaml: string): string[] {
  const out: string[] = [];
  for (const line of blockLines(yaml, "packages:")) {
    const match = /^\s+-\s*"?([^"\s]+)"?\s*$/.exec(line);
    if (match?.[1]) out.push(match[1]);
  }
  return out;
}

/**
 * A line scanner rather than a YAML parser, keeping one out of the scaffolder's
 * dependencies.
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

/**
 * A header line has nothing after its colon; an entry line carries a version.
 */
export function parseNamedCatalogs(
  yaml: string,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | undefined;
  for (const line of blockLines(yaml, "catalogs:")) {
    const catalogName = /^\s+"?([^":\s]+)"?\s*:\s*$/.exec(line)?.[1];
    if (catalogName) {
      current = out[catalogName] = {};
      continue;
    }
    const [, name, version] =
      /^\s+"?([^":\s]+)"?\s*:\s*(\S+)\s*$/.exec(line) ?? [];
    if (name && version && current) current[name] = version;
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
