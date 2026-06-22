import { withBasePath } from "../../base-path.js";

/**
 * The Vite-emitted manifest shape (subset). Vite writes this to
 * `<outDir>/.vite/manifest.json` when `build.manifest: true`; plumix's
 * Vite plugin reads it and exposes the parsed object via the
 * `virtual:plumix/asset-manifest` module that the generated worker
 * imports.
 */
interface AssetManifestEntry {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly isDynamicEntry?: boolean;
  readonly css?: readonly string[];
  readonly assets?: readonly string[];
  readonly imports?: readonly string[];
  readonly dynamicImports?: readonly string[];
}

export type AssetManifest = Readonly<Record<string, AssetManifestEntry>>;

// The Vite lifecycle command the SSR render path branches on: `serve` (dev)
// vs `build` (production).
export type ViteCommand = "serve" | "build";

// Walks the import graph starting from every `isEntry: true` chunk and
// collects CSS from every reachable chunk (including code-split nodes
// under `imports[]` / `dynamicImports[]`). Dedupes across entries that
// share a bundle. Cycle-safe via the visited set.
//
// Output order is DFS-from-entries — deterministic for a given manifest
// (V8 preserves Object.entries insertion order) but not author-
// controllable. Themes that need a specific cascade should declare
// CSS via `document.link[]` (emits before bundled CSS) and rely on
// CSS specificity for the rest.
export function bundledCssTags(manifest: AssetManifest, basePath = ""): string {
  const css = new Set<string>();
  const visited = new Set<string>();
  for (const [key, entry] of Object.entries(manifest)) {
    if (entry.isEntry) collectReachableCss(key, manifest, css, visited);
  }
  if (css.size === 0) return "";
  return Array.from(css)
    .map(
      (href) =>
        `<link rel="stylesheet" href="${withBasePath(`/${href}`, basePath)}" />`,
    )
    .join("");
}

// CSS counterpart to `injectIslandsBootstrap`: dev has no asset manifest, so
// load the client entry (which side-effect-imports the theme `css`) and let
// Vite inject the stylesheets. No-op in build, where `bundledCssTags` links.
const DEV_CLIENT_ENTRY_PATH = "/.plumix/client-entry.ts";

export function devThemeStylesTag(command: ViteCommand, basePath = ""): string {
  if (command !== "serve") return "";
  const src = withBasePath(DEV_CLIENT_ENTRY_PATH, basePath);
  return `<script type="module" src="${src}"></script>`;
}

// In build, resolve the hashed asset path from Vite's manifest; in dev (or
// the cold-build edge where the entry isn't in the manifest yet) fall back
// to the source path Vite's dev server serves directly.
export function resolveEntryUrl(
  manifest: AssetManifest,
  command: ViteCommand,
  key: string,
  devPath: string,
  basePath = "",
): string {
  if (command === "build") {
    const entry = manifest[key];
    if (entry?.file) return withBasePath("/" + entry.file, basePath);
  }
  return devPath;
}

function collectReachableCss(
  key: string,
  manifest: AssetManifest,
  css: Set<string>,
  visited: Set<string>,
): void {
  if (visited.has(key)) return;
  visited.add(key);
  const entry = manifest[key];
  if (!entry) return;
  for (const href of entry.css ?? []) css.add(href);
  for (const dep of entry.imports ?? []) {
    collectReachableCss(dep, manifest, css, visited);
  }
  for (const dep of entry.dynamicImports ?? []) {
    collectReachableCss(dep, manifest, css, visited);
  }
}
