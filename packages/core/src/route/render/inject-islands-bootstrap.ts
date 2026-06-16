// Conditionally injects the islands runtime `<script>` tag into the
// SSR'd body — only when the page contains at least one
// `<plumix-island>`. Pages without islands ship zero JS.
//
// In dev (`serve`) the script src points at `/.plumix/islands-entry.ts`
// — Vite serves the source directly via its dev-server middleware so
// HMR works on full page reload. The asset manifest is intentionally
// not consulted in dev mode because a stale `dist/.vite/manifest.json`
// from a previous build would otherwise leak hashed prod paths into
// dev responses.
//
// In build (`build`) the script src is the hashed asset path Vite
// emitted for the `plumix-islands-runtime` Rollup input (registered as
// `.plumix/islands-entry.ts` in the Vite plugin's
// `rollupOptions.input`). Read from Vite's `.vite/manifest.json`.

import type { AssetManifest, ViteCommand } from "./asset-manifest.js";
import { withBasePath } from "../../base-path.js";

const DEV_ENTRY_PATH = "/.plumix/islands-entry.ts";
const RUNTIME_MANIFEST_KEY = ".plumix/islands-entry.ts";
// The renderer chunk (React + ReactDOM) is fetched lazily by the custom
// element on first hydration, not loaded eagerly here. We only thread
// its URL onto the runtime script tag as `data-plumix-renderer-url`;
// `island-runtime.ts` reads it and hands it to the element so a page
// whose islands never hydrate ships zero React.
const DEV_RENDERER_PATH = "/.plumix/islands-renderer-entry.ts";
const RENDERER_MANIFEST_KEY = ".plumix/islands-renderer-entry.ts";

export function injectIslandsBootstrap(
  body: string,
  manifest: AssetManifest,
  command: ViteCommand,
  basePath = "",
): string {
  if (!body.includes("<plumix-island")) return body;
  const src = resolveEntryUrl(
    manifest,
    command,
    RUNTIME_MANIFEST_KEY,
    DEV_ENTRY_PATH,
    basePath,
  );
  const rendererUrl = resolveEntryUrl(
    manifest,
    command,
    RENDERER_MANIFEST_KEY,
    DEV_RENDERER_PATH,
    basePath,
  );
  return (
    body +
    `<script type="module" src="${src}" data-plumix-renderer-url="${rendererUrl}"></script>`
  );
}

// In build, resolve the hashed asset path from Vite's manifest; in dev
// (or on the cold-build edge where the entry isn't in the manifest yet)
// fall back to the source path Vite's dev server serves directly.
function resolveEntryUrl(
  manifest: AssetManifest,
  command: ViteCommand,
  key: string,
  devPath: string,
  basePath: string,
): string {
  if (command === "build") {
    const entry = manifest[key];
    if (entry?.file) return withBasePath("/" + entry.file, basePath);
  }
  return devPath;
}
