import type { AppContext } from "../context/app.js";
import { settingsLoader } from "../template-deps-core.js";

/** The `site` settings group as a flat `key → value` bag (empty when unset). */
export async function loadSiteSettings(
  ctx: AppContext,
): Promise<Record<string, unknown>> {
  const groups = await settingsLoader(["site"], ctx);
  return groups.site ?? {};
}

/** A settings value coerced to a non-empty string, or null. */
export function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
