import type { Selection } from "./types.js";
import { ScaffoldError } from "../errors.js";
import { fillProjectName } from "./types.js";
import { assembleWrangler } from "./wrangler.js";

const WRANGLER_FILE = "wrangler.jsonc";

/**
 * Resolve the runtime's contributed whole files (e.g. Cloudflare's
 * `wrangler.jsonc`), substituting the project name. The wrangler file also
 * receives the selection's binding patches so plugins can add bindings.
 */
export function assembleRuntimeFiles(
  selection: Selection,
  wranglerPatches: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const { projectName, runtime } = selection;
  // Bindings with nowhere to land would vanish silently — fail loud instead.
  if (
    Object.keys(wranglerPatches).length > 0 &&
    !(WRANGLER_FILE in runtime.files)
  ) {
    throw ScaffoldError.wranglerFileMissing({ runtime: runtime.id });
  }
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(runtime.files)) {
    out[path] =
      path === WRANGLER_FILE
        ? assembleWrangler(content, wranglerPatches, projectName)
        : fillProjectName(content, projectName);
  }
  return out;
}
