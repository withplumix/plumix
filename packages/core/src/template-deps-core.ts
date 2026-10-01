import { inArray } from "drizzle-orm";

import type { AppContext } from "./context/app-context.js";
import type { SettingsBag } from "./db/schema/settings.js";
import type { JsonValue } from "./json.js";
import type { StartingMetaField } from "./plugin/fields/starting-meta.js";
import type { MutablePluginRegistry } from "./plugin/manifest.js";
import { declarePageTags } from "./cdn/contract/page-tags.js";
import { settingsTag } from "./cdn/contract/tags.js";
import { memoBatch } from "./context/memo.js";
import { settings, SETTINGS_CREATED_KEY } from "./db/schema/settings.js";
import { startingMeta } from "./plugin/fields/starting-meta.js";

// Augment the registry with the core `settings` dep — themes declare
// `defineTemplate({ settings: ["site-info", ...], render })` and the
// loader returns each requested group as a `Record<key, value>`.
declare module "./template.js" {
  interface TemplateDepRegistry {
    settings: { slug: string; result: SettingsBag };
  }
}

/**
 * Seed the plugin registry with built-in template deps before plugin
 * `setup()` runs. Mirrors `registerCoreLookupAdapters` — core's slot
 * lands first so a plugin `ctx.registerTemplateDep("settings", ...)`
 * trips the boot-time collision guard.
 */
export function registerCoreTemplateDeps(
  registry: MutablePluginRegistry,
): void {
  registry.templateDeps.set("settings", {
    kind: "settings",
    registeredBy: null,
    load: settingsLoader,
  });
}

/** One stored row of a settings group. */
export interface SettingsRow {
  readonly key: string;
  readonly value: JsonValue;
}

/**
 * A settings group as every reader sees it. A group counts as created once its
 * first save has written the `__plumix_created` marker (ADR 0026). Until then
 * its fields' starting values stand in where storage has no key; after it,
 * storage alone is the truth and a cleared setting stays absent. The marker
 * itself is never part of the bag.
 */
export function settingsGroupBag(
  rows: readonly SettingsRow[],
  fields: readonly StartingMetaField[],
): SettingsBag {
  const stored: Record<string, JsonValue> = {};
  let created = false;
  for (const row of rows) {
    if (row.key === SETTINGS_CREATED_KEY) created = true;
    else stored[row.key] = row.value;
  }
  return created ? stored : { ...startingMeta(fields), ...stored };
}

export async function settingsLoader(
  groups: readonly string[],
  ctx: AppContext,
): Promise<Record<string, SettingsBag>> {
  const unique = [...new Set(groups)];
  if (unique.length === 0) return {};
  // A response that printed a group is stored under its tag, so saving the
  // group purges it — a group with no rows included, since its first save
  // changes what the page shows.
  declarePageTags(ctx, unique.map(settingsTag));
  // Per-group memo (#1493): head defaults, SEO surfaces, and the template
  // dep all read `group='site'` in one request — only the first pays a
  // query. The lazy batch queries every requested group in one `IN(...)`;
  // a group with no rows memoizes as `null` and stays absent from the
  // result so the caller's `loadTemplateDeps` still fills missing slugs
  // with `null`.
  const bags = await memoBatch(
    ctx.memo,
    unique,
    (group) => `core:settings-group:${group}`,
    async () => {
      const rows = await ctx.db
        .select({
          group: settings.group,
          key: settings.key,
          value: settings.value,
        })
        .from(settings)
        .where(inArray(settings.group, unique));
      const byGroup = new Map<string, SettingsRow[]>();
      for (const row of rows) {
        const groupRows = byGroup.get(row.group) ?? [];
        groupRows.push({ key: row.key, value: row.value });
        byGroup.set(row.group, groupRows);
      }
      return byGroup;
    },
    // The same tag drops the memo entry: a read after a settings write in
    // the same request sees it — a group that had no rows included.
    (group) => [settingsTag(group)],
  );
  const grouped: Record<string, SettingsBag> = {};
  unique.forEach((group, i) => {
    const rows = bags[i];
    const bag = settingsGroupBag(
      rows ?? [],
      ctx.plugins.settingsGroups.get(group)?.fields ?? [],
    );
    if (rows || Object.keys(bag).length > 0) grouped[group] = bag;
  });
  return grouped;
}
