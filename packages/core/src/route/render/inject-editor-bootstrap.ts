// Injects the visual-editor runtime `<script>` only when the edit gate
// authorized it (see resolveEditMode). Mirrors injectIslandsBootstrap, but
// gated on the edit-mode decision rather than page content.

import type { AssetManifest, ViteCommand } from "./asset-manifest.js";
import { resolveEntryUrl } from "./asset-manifest.js";

const DEV_ENTRY_PATH = "/.plumix/editor-entry.ts";
const RUNTIME_MANIFEST_KEY = ".plumix/editor-entry.ts";

export function injectEditorBootstrap(
  body: string,
  injectRuntime: boolean,
  manifest: AssetManifest,
  command: ViteCommand,
  basePath = "",
): string {
  if (!injectRuntime) return body;
  const src = resolveEntryUrl(
    manifest,
    command,
    RUNTIME_MANIFEST_KEY,
    DEV_ENTRY_PATH,
    basePath,
  );
  return (
    body + `<script type="module" src="${src}" data-plumix-editor></script>`
  );
}
