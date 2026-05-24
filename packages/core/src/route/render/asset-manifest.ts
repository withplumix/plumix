/**
 * The Vite-emitted manifest shape (subset). Vite writes this to
 * `<outDir>/.vite/manifest.json` when `build.manifest: true`; plumix's
 * Vite plugin reads it and exposes the parsed object via the
 * `virtual:plumix/asset-manifest` module that the generated worker
 * imports.
 */
export interface AssetManifestEntry {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly isDynamicEntry?: boolean;
  readonly css?: readonly string[];
  readonly assets?: readonly string[];
  readonly imports?: readonly string[];
  readonly dynamicImports?: readonly string[];
}

export type AssetManifest = Readonly<Record<string, AssetManifestEntry>>;

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
export function bundledCssTags(manifest: AssetManifest): string {
  const css = new Set<string>();
  const visited = new Set<string>();
  for (const [key, entry] of Object.entries(manifest)) {
    if (entry.isEntry) collectReachableCss(key, manifest, css, visited);
  }
  if (css.size === 0) return "";
  return Array.from(css)
    .map((href) => `<link rel="stylesheet" href="/${href}" />`)
    .join("");
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
