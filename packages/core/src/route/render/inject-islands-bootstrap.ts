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

import type { AssetManifest } from "./asset-manifest.js";

const DEV_ENTRY_PATH = "/.plumix/islands-entry.ts";
const RUNTIME_MANIFEST_KEY = ".plumix/islands-entry.ts";

export function injectIslandsBootstrap(
  body: string,
  manifest: AssetManifest,
  command: "serve" | "build",
): string {
  if (!body.includes("<plumix-island")) return body;
  let src = DEV_ENTRY_PATH;
  if (command === "build") {
    const entry = manifest[RUNTIME_MANIFEST_KEY];
    if (entry?.file) src = "/" + entry.file;
  }
  return body + `<script type="module" src="${src}"></script>`;
}
