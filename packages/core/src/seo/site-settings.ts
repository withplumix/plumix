import type { AppContext } from "../context/app-context.js";
import type { SettingsBag } from "../db/schema/settings.js";
import { settingsLoader } from "../template-deps-core.js";

/**
 * A group with no rows is absent. Ask for several at once: one memoized query
 * keeps a render on a single round-trip.
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
