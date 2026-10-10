import type { PlumixManifest } from "./manifest-types.js";
import { PluginDefinitionError } from "./errors.js";
import { MANIFEST_SCRIPT_ID } from "./manifest-types.js";

/** Escapes `</` so a stray `</script>` in the JSON can't end the tag. */
export function serializeManifestScript(manifest: PlumixManifest): string {
  const safe = JSON.stringify(manifest).replaceAll("</", "<\\/");
  return `<script id="${MANIFEST_SCRIPT_ID}" type="application/json">${safe}</script>`;
}

/** Case-insensitive because a minifier could uppercase the tag. */
const MANIFEST_SCRIPT_RE = new RegExp(
  `<script id="${MANIFEST_SCRIPT_ID}"[^>]*>[\\s\\S]*?</script>`,
  "i",
);

/**
 * Throws if the placeholder is missing, which means a stale admin bundle;
 * appending would mask that.
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
