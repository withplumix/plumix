import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

// Resolve a `"use client"` module's chunk URL for the shim's
// `<plumix-island chunk-url="…">` attribute.
//
// Dev (`serve`): `/@fs<absolute-id>` — Vite serves the original
// module via its dev-server middleware. The custom element's dynamic
// `import()` loads it through Vite's module graph so HMR plumbing
// works (full-page reload on edit; live patch isn't supported across
// the island boundary).
//
// Build: look up the per-island Rollup input by its
// `islandEntryName` and emit the hashed `file:` from Vite's
// `.vite/manifest.json`. Falls back to `/@fs<id>` if the manifest
// entry is missing (cold-build edge case the asset-manifest virtual
// module already documents).
export function resolveIslandChunkUrl(
  id: string,
  command: "serve" | "build",
  rootDir: string,
): string {
  if (command === "serve") return "/@fs" + id;
  const manifest = loadAssetManifest(rootDir);
  // Vite's manifest keys source paths relative to the project root,
  // not by the `rollupOptions.input` name. Compute the relative POSIX
  // path so the lookup matches.
  const relativeId = relative(rootDir, id).replace(/\\/g, "/");
  const entry = manifest[relativeId];
  if (entry?.file) return "/" + entry.file;
  return "/@fs" + id;
}

/**
 * The slice of Vite's `manifest.json` the island chunk lookup reads: source
 * path → the chunk it built into. A missing file reads as an empty manifest,
 * which is the cold-build case the virtual module already documents.
 */
type AssetManifest = Readonly<Record<string, { readonly file?: string }>>;

export function loadAssetManifest(rootDir: string): AssetManifest {
  const candidates = [
    resolve(rootDir, "dist/client/.vite/manifest.json"),
    resolve(rootDir, "dist/.vite/manifest.json"),
  ];
  for (const path of candidates) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as AssetManifest;
    } catch {
      continue;
    }
  }
  return {};
}
