import type { AppContext } from "../context/app.js";
import { settingsLoader } from "../template-deps-core.js";

/** The `site` settings group as a flat `key → value` bag (empty when unset). */
export async function loadSiteSettings(
  ctx: AppContext,
): Promise<Record<string, unknown>> {
  const groups = await settingsLoader(["site"], ctx);
  return groups.site ?? {};
}
