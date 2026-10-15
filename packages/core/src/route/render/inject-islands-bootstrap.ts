import type { EmbeddedAuthContext } from "../../auth/client/render-context.js";
import type { AssetManifest, ViteCommand } from "./asset-manifest.js";
import { resolveEntryUrl } from "./asset-manifest.js";

const DEV_ENTRY_PATH = "/.plumix/islands-entry.ts";
const RUNTIME_MANIFEST_KEY = ".plumix/islands-entry.ts";
/**
 * Passed as a URL, not loaded, so a page whose islands never hydrate ships zero
 * React.
 */
const DEV_RENDERER_PATH = "/.plumix/islands-renderer-entry.ts";
const RENDERER_MANIFEST_KEY = ".plumix/islands-renderer-entry.ts";

export function injectIslandsBootstrap(
  body: string,
  manifest: AssetManifest,
  command: ViteCommand,
  basePath = "",
  auth?: EmbeddedAuthContext,
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
  // `authClient`'s render context, so an island hydrates with what the server
  // rendered. `<` is escaped so a label can't close the script.
  const authScript =
    auth === undefined
      ? ""
      : `<script type="application/json" data-plumix-auth="">${JSON.stringify(
          auth,
        ).replace(/</g, "\\u003c")}</script>`;
  // A hydrated island has no `PlumixProvider` or `<base href>`, so this is its
  // only base-path signal.
  return (
    body +
    authScript +
    `<script type="module" src="${src}" data-plumix-renderer-url="${rendererUrl}" data-plumix-base-path="${basePath}"></script>`
  );
}
