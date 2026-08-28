import type { AppContext } from "../context/app.js";
import type { SettingsBag } from "../db/schema/settings.js";
import { settingsLoader } from "../template-deps-core.js";

/**
 * Settings groups as flat `key → value` bags, keyed by group name; a group
 * with no rows is absent. One query for the lot, memoized per group for the
 * request — so asking for several at once is what keeps a render on a single
 * round-trip.
 */
export async function loadSettingsGroups(
  ctx: AppContext,
  groups: readonly string[],
): Promise<Record<string, SettingsBag>> {
  return settingsLoader(groups, ctx);
}

/** The `site` settings group as a flat `key → value` bag (empty when unset). */
export async function loadSiteSettings(ctx: AppContext): Promise<SettingsBag> {
  const groups = await loadSettingsGroups(ctx, ["site"]);
  return groups.site ?? {};
}

/** A settings value coerced to a non-empty string, or null. */
export function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
