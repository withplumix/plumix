import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

/**
 * Dev serves the original module through Vite's graph. A build falls back to
 * `/@fs<id>` when the manifest entry is missing, the cold-build case.
 */
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

/** A missing file reads as an empty manifest, the cold-build case. */
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
