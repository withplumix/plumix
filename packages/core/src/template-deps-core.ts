import { inArray } from "drizzle-orm";

import type { AppContext } from "./context/app.js";
import type { MutablePluginRegistry } from "./plugin/manifest.js";
import { memoBatch } from "./context/memo.js";
import { settings } from "./db/schema/settings.js";

// Augment the registry with the core `settings` dep — themes declare
// `defineTemplate({ settings: ["site-info", ...], render })` and the
// loader returns each requested group as a `Record<key, value>`.
declare module "./template.js" {
  interface TemplateDepRegistry {
    settings: { slug: string; result: Record<string, unknown> };
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

export async function settingsLoader(
  groups: readonly string[],
  ctx: AppContext,
): Promise<Record<string, Record<string, unknown>>> {
  const unique = [...new Set(groups)];
  if (unique.length === 0) return {};
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
      const byGroup = new Map<string, Record<string, unknown>>();
      for (const row of rows) {
        const bag = byGroup.get(row.group) ?? {};
        bag[row.key] = row.value;
        byGroup.set(row.group, bag);
      }
      return byGroup;
    },
  );
  const grouped: Record<string, Record<string, unknown>> = {};
  unique.forEach((group, i) => {
    const bag = bags[i];
    if (bag) grouped[group] = bag;
  });
  return grouped;
}
