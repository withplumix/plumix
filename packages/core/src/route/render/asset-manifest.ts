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

// Dedupes across entries that share a CSS bundle. Walks `isEntry: true`
// chunks only; CSS attached to code-split chunks (via `imports[]` /
// `dynamicImports[]`) won't surface until that walk lands as a follow-up.
export function bundledCssTags(manifest: AssetManifest): string {
  const seen = new Set<string>();
  for (const entry of Object.values(manifest)) {
    if (!entry.isEntry || !entry.css) continue;
    for (const href of entry.css) seen.add(href);
  }
  if (seen.size === 0) return "";
  return Array.from(seen)
    .map((href) => `<link rel="stylesheet" href="/${href}" />`)
    .join("");
}
