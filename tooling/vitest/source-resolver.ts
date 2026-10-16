import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vitest/config";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The `packages:` globs. A package with no `dist` export, like a playground
 * or a tooling config, resolves to no source and falls through.
 */
function workspaceGlobs(): string[] {
  const yaml = readFileSync(join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8");
  const block = /^packages:\n((?:[ \t]+.*\n|\s*\n)*)/m.exec(yaml)?.[1] ?? "";
  return [...block.matchAll(/^\s+-\s+"?([^"\s#]+)"?/gm)].flatMap(([, glob]) =>
    glob ? [glob] : [],
  );
}

/**
 * Compiled catalogs have no source form; the stub lets `test` skip
 * `i18n:compile`.
 */
const EMPTY_CATALOG = fileURLToPath(
  new URL("./empty-catalog.ts", import.meta.url),
);

interface WorkspacePackage {
  readonly dir: string;
  readonly exports: Record<string, unknown>;
  /** The `browser` field's bare-specifier remaps (`sanitize-html` → shim). */
  readonly browser: Record<string, string>;
}

function loadWorkspacePackages(): Map<string, WorkspacePackage> {
  const map = new Map<string, WorkspacePackage>();
  const manifests = globSync(
    workspaceGlobs().map((glob) => `${glob}/package.json`),
    { cwd: REPO_ROOT },
  );
  for (const manifest of manifests) {
    const path = join(REPO_ROOT, manifest);
    const pkg = JSON.parse(readFileSync(path, "utf8")) as {
      name?: string;
      exports?: Record<string, unknown>;
      browser?: Record<string, string>;
    };
    if (pkg.name && pkg.exports)
      map.set(pkg.name, {
        dir: dirname(path),
        exports: pkg.exports,
        browser: pkg.browser ?? {},
      });
  }
  return map;
}

/**
 * A client build takes a `browser` condition first, as a bundler would.
 */
function distTarget(entry: unknown, browser: boolean): string | null {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const conditions = entry as Record<string, unknown>;
    const keys = ["import", "default", "node", "types"];
    for (const key of browser ? ["browser", ...keys] : keys) {
      const value = conditions[key];
      if (typeof value === "string") return value;
    }
  }
  return null;
}

// `./dist/plugin/manifest.js` → the `src` file that builds it. The tsc build is
// 1:1 (`src/**/*.ts` → `dist/**/*.js`), so swap the segment and try each source
// extension.
function sourceCandidate(dir: string, target: string): string | null {
  if (!target.includes("/dist/")) return null;
  const stripped = target
    .replace("/dist/", "/src/")
    .replace(/\.(js|mjs|cjs|d\.ts|d\.mts)$/, "");
  for (const ext of [".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"]) {
    const candidate = join(dir, stripped + ext);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function splitSpecifier(
  source: string,
): { name: string; subpath: string } | null {
  if (source.startsWith("@")) {
    const parts = source.split("/");
    if (parts.length < 2) return null;
    const name = `${parts[0]}/${parts[1]}`;
    const rest = parts.slice(2).join("/");
    return { name, subpath: rest ? `./${rest}` : "." };
  }
  const [name, ...rest] = source.split("/");
  if (!name) return null;
  return { name, subpath: rest.length ? `./${rest.join("/")}` : "." };
}

function matchExport(
  exports: Record<string, unknown>,
  subpath: string,
): { entry: unknown; star?: string } | null {
  if (subpath in exports) return { entry: exports[subpath] };
  for (const [key, entry] of Object.entries(exports)) {
    const star = key.indexOf("*");
    if (star === -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (subpath.startsWith(prefix) && subpath.endsWith(suffix)) {
      return {
        entry,
        star: subpath.slice(prefix.length, subpath.length - suffix.length),
      };
    }
  }
  return null;
}

/**
 * Applies the `browser` field as a browser bundler would; the remap names a
 * `dist/` file, so it is swapped to `src` too.
 */
function browserRemap(
  packages: ReadonlyMap<string, WorkspacePackage>,
  source: string,
  importer: string,
): string | null {
  for (const pkg of packages.values()) {
    const target = pkg.browser[source];
    if (target === undefined || !importer.startsWith(pkg.dir + sep)) continue;
    return sourceCandidate(pkg.dir, target);
  }
  return null;
}

/**
 * Only Vite's module graph is rewritten: `require.resolve` and `fs` reads
 * still hit `dist`, so such packages keep a `build` dep in turbo.json.
 */
export function plumixSourceResolver(): Plugin {
  const packages = loadWorkspacePackages();
  return {
    name: "plumix:source-resolver",
    enforce: "pre",
    resolveId(source, importer, options) {
      // Vitest and a server build transform for SSR; a client build does not.
      const browser = options.ssr !== true;
      if (browser && importer !== undefined) {
        const remapped = browserRemap(packages, source, importer);
        if (remapped) return remapped;
      }
      const split = splitSpecifier(source);
      if (!split) return null;
      const pkg = packages.get(split.name);
      if (!pkg) return null;
      const matched = matchExport(pkg.exports, split.subpath);
      if (!matched) return null;
      let target = distTarget(matched.entry, browser);
      if (!target) return null;
      if (matched.star !== undefined)
        target = target.replaceAll("*", matched.star);
      if (target.includes("/locales/")) return EMPTY_CATALOG;
      return sourceCandidate(pkg.dir, target);
    },
  };
}

/**
 * Every workspace export as tsconfig `paths`, each to the file
 * `plumixSourceResolver()` resolves it to for the node tier.
 */
export function plumixSourcePaths(): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  for (const [name, pkg] of loadWorkspacePackages()) {
    for (const [key, entry] of Object.entries(pkg.exports)) {
      const target = distTarget(entry, false);
      if (!target) continue;
      const specifier = `${name}${key.slice(1)}`;
      const source = target.includes("/locales/")
        ? EMPTY_CATALOG
        : sourceCandidate(pkg.dir, target);
      if (source) paths[specifier] = [source];
    }
  }
  return paths;
}
