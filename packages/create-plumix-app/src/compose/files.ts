import type { Selection } from "./types.js";
import { fillProjectName } from "./types.js";

/**
 * Resolve the runtime's contributed whole files (e.g. Cloudflare's
 * `wrangler.jsonc`), substituting the project name. The runtime owns
 * every runtime-specific file, so this is the seam through which a
 * non-Cloudflare runtime would contribute its own.
 */
export function assembleRuntimeFiles(
  selection: Selection,
): Record<string, string> {
  const { projectName, runtime } = selection;
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(runtime.files)) {
    out[path] = fillProjectName(content, projectName);
  }
  return out;
}
