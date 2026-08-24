import type { AppContext } from "../context/app.js";
import type { SettingsBag } from "../db/schema/settings.js";
import { settingsLoader } from "../template-deps-core.js";

/** The `site` settings group as a flat `key → value` bag (empty when unset). */
export async function loadSiteSettings(ctx: AppContext): Promise<SettingsBag> {
  const groups = await settingsLoader(["site"], ctx);
  return groups.site ?? {};
}

/** A settings value coerced to a non-empty string, or null. */
export function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
