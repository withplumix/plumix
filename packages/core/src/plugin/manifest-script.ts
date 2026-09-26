// Manifest HTML transport — serialises a `PlumixManifest` into the admin
// `index.html`'s `<script id="plumix-manifest">` block. Its sole caller is the
// plumix Vite plugin. Re-exported unchanged from the public
// `@plumix/core/manifest` barrel.

import type { PlumixManifest } from "./manifest-types.js";
import { PluginDefinitionError } from "./errors.js";
import { MANIFEST_SCRIPT_ID } from "./manifest-types.js";

/**
 * Serialise a manifest into the `<script>` markup injected into the admin
 * `index.html`. The payload lives inside a `type="application/json"` block,
 * so it isn't executed — but a stray `</script>` sequence would still end
 * the tag and leak the remainder into the document. Escape the slash to
 * neutralise that, which is the standard JSON-in-HTML-script hardening.
 */
export function serializeManifestScript(manifest: PlumixManifest): string {
  const safe = JSON.stringify(manifest).replaceAll("</", "<\\/");
  return `<script id="${MANIFEST_SCRIPT_ID}" type="application/json">${safe}</script>`;
}

// Case-insensitive match on the script tag — Vite's bundler today emits
// lowercase tags and we control the placeholder, but minifiers upstream
// could normalise to uppercase and we'd rather match than silently fall
// through to the fail-fast branch.
const MANIFEST_SCRIPT_RE = new RegExp(
  `<script id="${MANIFEST_SCRIPT_ID}"[^>]*>[\\s\\S]*?</script>`,
  "i",
);

/**
 * Replace the `<script id="plumix-manifest">` placeholder in the admin's
 * `index.html` with a freshly serialised manifest. Throws if the placeholder
 * is missing — that's an indicator that the admin bundle is out of date
 * (was built without the placeholder), and silently appending would mask
 * the staleness.
 */
export function injectManifestIntoHtml(
  html: string,
  manifest: PlumixManifest,
): string {
  if (!MANIFEST_SCRIPT_RE.test(html)) {
    throw PluginDefinitionError.adminManifestPlaceholderMissing({
      scriptId: MANIFEST_SCRIPT_ID,
    });
  }
  return html.replace(MANIFEST_SCRIPT_RE, serializeManifestScript(manifest));
}
