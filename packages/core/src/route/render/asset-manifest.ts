import { withBasePath } from "../../base-path.js";

// Subset of Vite's `.vite/manifest.json` entry.
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

// No-op in serve: a stale build manifest points at hashed URLs. Order isn't
// author-controllable; themes needing a cascade use `document.link[]`.
export function bundledCssTags(
  manifest: AssetManifest,
  command: ViteCommand,
  basePath = "",
): string {
  if (command !== "build") return "";
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

// Dev has no asset manifest, so the client entry side-effect-imports the theme
// `css` and Vite injects it.
const DEV_CLIENT_ENTRY_PATH = "/.plumix/client-entry.ts";

export function devThemeStylesTag(command: ViteCommand, basePath = ""): string {
  if (command !== "serve") return "";
  const src = withBasePath(DEV_CLIENT_ENTRY_PATH, basePath);
  return `<script type="module" src="${src}"></script>`;
}

// The client entry injects `<style>` only after it runs, so a render-blocking
// link avoids a dev FOUC. The script still owns CSS HMR: its `<style>` lands
// later and wins.
export function devThemeCssLinks(
  themeCss: readonly string[],
  command: ViteCommand,
  basePath = "",
): string {
  if (command !== "serve") return "";
  const hrefs = new Set(
    themeCss.map(toDevCssHref).filter((href): href is string => href !== null),
  );
  return Array.from(hrefs)
    .map(
      (href) =>
        `<link rel="stylesheet" href="${withBasePath(href, basePath)}" />`,
    )
    .join("");
}

// Must agree with the Vite plugin's `toClientEntryImport`. Aliased and `../`
// specifiers have no stable dev URL.
function toDevCssHref(path: string): string | null {
  if (path.startsWith("~") || path.startsWith("@") || path.startsWith("../")) {
    return null;
  }
  if (path.startsWith("/")) return path;
  if (path.startsWith("./")) return "/" + path.slice(2);
  return "/" + path;
}

// Falls back to the dev source path on a cold build where the entry isn't in
// the manifest yet.
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
