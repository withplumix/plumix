import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SHARED_ADMIN_RUNTIME_KEYS } from "@plumix/core/admin";

// Shared by the façade guards in `src/`. It lives in `test/` because
// `tsconfig.build.json` excludes it; a helper under `src/` would ship in `dist/`.
export const packageDir = resolve(import.meta.dirname, "..");

interface ExportSpec {
  readonly types: string;
  readonly default: string;
}

interface Manifest {
  readonly exports: Readonly<Record<string, ExportSpec>>;
  readonly dependencies: Readonly<Record<string, string>>;
}

function readManifest(dir: string): Partial<Manifest> {
  return JSON.parse(
    readFileSync(resolve(dir, "package.json"), "utf8"),
  ) as Partial<Manifest>;
}

const pkg = readManifest(packageDir) as Manifest;

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

/** A loaded module's exports, by name. */
export type Namespace = Readonly<Record<string, unknown>>;

/** Specifier → why the unit tier cannot evaluate it. */
export type Unloadable = Readonly<Record<string, string>>;

interface LoadedModules {
  /** Every subpath in `plumix`'s exports map (`./vite`). */
  readonly facade: ReadonlyMap<string, Namespace>;
  /** Every subpath of an internal package, by specifier (`@plumix/core/db`). */
  readonly sources: ReadonlyMap<string, Namespace>;
}

export function facadeSpecifier(subpath: string): string {
  return `plumix${subpath.slice(1)}`;
}

// A wildcard subpath (`./locales/*`) names files, not one module.
function specifiersOf(name: string, exports: Manifest["exports"] = {}) {
  return Object.keys(exports)
    .filter((subpath) => !subpath.includes("*"))
    .map((subpath) => `${name}${subpath.slice(1)}`);
}

// The internal packages are the ones the façade depends on.
const internalSpecifiers = Object.keys(pkg.dependencies)
  .filter((name) => name.startsWith("@plumix/"))
  .flatMap((name) =>
    specifiersOf(
      name,
      readManifest(resolve(packageDir, "node_modules", name)).exports,
    ),
  );

function isNamespace(value: unknown): value is Namespace {
  return typeof value === "object" && value !== null;
}

async function loadEach(
  specifiers: readonly string[],
  unloadable: Unloadable,
): Promise<Map<string, Namespace>> {
  return new Map(
    await Promise.all(
      specifiers
        .filter((specifier) => !(specifier in unloadable))
        .map(async (specifier): Promise<[string, Namespace]> => {
          const namespace: unknown = await import(/* @vite-ignore */ specifier);
          if (!isNamespace(namespace))
            throw new Error(`${specifier} did not load as a module`);
          return [specifier, namespace];
        }),
    ),
  );
}

export async function loadModules(
  unloadable: Unloadable,
): Promise<LoadedModules> {
  const facadeSubpaths = Object.keys(pkg.exports);
  const stale = Object.keys(unloadable).filter(
    (specifier) =>
      !internalSpecifiers.includes(specifier) &&
      !facadeSubpaths.map(facadeSpecifier).includes(specifier),
  );
  if (stale.length > 0)
    throw new Error(`no exports map has ${stale.join(", ")}; drop it`);

  // The admin shims read their upstream namespace off admin's global runtime
  // as they evaluate. What they publish is upstream's, never an internal
  // package's, so an empty namespace per runtime key is enough to load them.
  (globalThis as { plumix?: unknown }).plumix ??= {
    runtime: Object.fromEntries(
      Object.values(SHARED_ADMIN_RUNTIME_KEYS).map((key) => [key, {}]),
    ),
  };

  const [facade, sources] = await Promise.all([
    loadEach(facadeSubpaths.map(facadeSpecifier), unloadable),
    loadEach(internalSpecifiers, unloadable),
  ]);
  return {
    facade: new Map(
      facadeSubpaths.flatMap((subpath) => {
        const namespace = facade.get(facadeSpecifier(subpath));
        return namespace === undefined ? [] : [[subpath, namespace] as const];
      }),
    ),
    sources,
  };
}
