import { glob, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  Contribution,
  PluginDescriptor,
  RuntimeDescriptor,
} from "./compose/types.js";
import { ScaffoldError } from "./errors.js";

/** The raw `plumix.scaffold` block as authored in a package's package.json. */
interface RawScaffoldMeta extends Contribution {
  readonly kind: "runtime" | "plugin";
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly category?: string;
  readonly authOrigin?: string;
  readonly authOriginComment?: string;
  readonly deps?: Record<string, string>;
  readonly devDeps?: Record<string, string>;
  /** dest path in the scaffolded project → source path in this package. */
  readonly files?: Record<string, string>;
  readonly capabilities?: Record<string, Contribution>;
  /** Plugin only: expression placed in the config `plugins` array. */
  readonly registration?: string;
  /** Plugin only: runtime capabilities the plugin needs. */
  readonly requires?: readonly string[];
}

interface RawPackageJson {
  readonly name?: string;
  readonly version?: string;
  readonly peerDependencies?: Record<string, string>;
  readonly plumix?: { scaffold?: RawScaffoldMeta };
}

export interface Registry {
  readonly runtimes: readonly RuntimeDescriptor[];
  readonly plugins: readonly PluginDescriptor[];
}

/**
 * Discover scaffoldable runtimes and plugins by scanning the workspace's
 * runtime and plugin packages for a `plumix.scaffold` block. Runtime files
 * are read into the descriptor as content, and plugin dependencies are
 * derived from the plugin's own package + peer dependencies.
 */
export async function loadRegistry(repoRoot: string): Promise<Registry> {
  const runtimes: RuntimeDescriptor[] = [];
  const plugins: PluginDescriptor[] = [];

  for await (const rel of glob("packages/runtimes/*/package.json", {
    cwd: repoRoot,
  })) {
    const { meta, pkgDir } = await readScaffold(repoRoot, rel);
    if (meta?.kind !== "runtime") continue;
    requireField(meta, rel, "label", meta.label);
    runtimes.push(await toRuntimeDescriptor(meta, pkgDir, rel));
  }

  for await (const rel of glob("packages/plugins/*/package.json", {
    cwd: repoRoot,
  })) {
    const { meta, pkg } = await readScaffold(repoRoot, rel);
    if (meta?.kind !== "plugin") continue;
    requireField(meta, rel, "label", meta.label);
    plugins.push(toPluginDescriptor(meta, pkg, rel));
  }

  runtimes.sort((a, b) => a.id.localeCompare(b.id));
  plugins.sort((a, b) => a.id.localeCompare(b.id));
  return { runtimes, plugins };
}

async function readScaffold(
  repoRoot: string,
  rel: string,
): Promise<{ meta?: RawScaffoldMeta; pkg: RawPackageJson; pkgDir: string }> {
  const pkgPath = join(repoRoot, rel);
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as RawPackageJson;
  return { meta: pkg.plumix?.scaffold, pkg, pkgDir: dirname(pkgPath) };
}

function requireField(
  meta: RawScaffoldMeta,
  rel: string,
  field: string,
  value: unknown,
): void {
  if (!value) {
    throw ScaffoldError.invalidScaffoldMeta({
      packagePath: rel,
      reason: `missing "${field}"`,
    });
  }
}

async function toRuntimeDescriptor(
  meta: RawScaffoldMeta,
  pkgDir: string,
  rel: string,
): Promise<RuntimeDescriptor> {
  const files: Record<string, string> = {};
  for (const [dest, src] of Object.entries(meta.files ?? {})) {
    try {
      files[dest] = await readFile(join(pkgDir, src), "utf8");
    } catch {
      throw ScaffoldError.invalidScaffoldMeta({
        packagePath: rel,
        reason: `references a missing file "${src}"`,
      });
    }
  }
  return {
    id: meta.id ?? meta.label.toLowerCase(),
    label: meta.label,
    description: meta.description,
    imports: meta.imports ?? [],
    configSlots: meta.configSlots ?? {},
    authOrigin: meta.authOrigin,
    authOriginComment: meta.authOriginComment,
    deps: meta.deps ?? {},
    devDeps: meta.devDeps ?? {},
    files,
    capabilities: meta.capabilities,
  };
}

function toPluginDescriptor(
  meta: RawScaffoldMeta,
  pkg: RawPackageJson,
  rel: string,
): PluginDescriptor {
  const { name } = pkg;
  const { registration } = meta;
  if (!name) {
    throw ScaffoldError.invalidScaffoldMeta({
      packagePath: rel,
      reason: 'the package has no "name"',
    });
  }
  if (!registration) {
    throw ScaffoldError.invalidScaffoldMeta({
      packagePath: rel,
      reason: 'missing "registration"',
    });
  }
  // Deps are derived, not authored: the plugin package itself (resolved
  // from its own version via the workspace protocol) plus its declared
  // peers. The package.json assembler dedupes overlaps with the base.
  const deps: Record<string, string> = {
    [name]: "workspace:*",
    ...pkg.peerDependencies,
  };
  return {
    id: meta.id ?? meta.label.toLowerCase(),
    label: meta.label,
    description: meta.description,
    category: meta.category,
    registration,
    imports: meta.imports ?? [],
    requires: meta.requires,
    configSlots: meta.configSlots,
    wrangler: meta.wrangler,
    deps,
  };
}
