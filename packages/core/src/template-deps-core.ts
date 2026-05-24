import { inArray } from "drizzle-orm";

import type { AppContext } from "./context/app.js";
import { settings } from "./db/schema/settings.js";
import type { MutablePluginRegistry } from "./plugin/manifest.js";

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

async function settingsLoader(
  groups: readonly string[],
  ctx: AppContext,
): Promise<Record<string, Record<string, unknown>>> {
  if (groups.length === 0) return {};
  const rows = await ctx.db
    .select({ group: settings.group, key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.group, [...groups]));
  // Build a `Record<group, Record<key, value>>` so each declared
  // group maps to its full key/value bag. Groups that have no rows
  // surface as undefined in the per-group record but the caller's
  // `loadTemplateDeps` fills missing slugs with `null`.
  const grouped: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    const bag = grouped[row.group] ?? {};
    bag[row.key] = row.value;
    grouped[row.group] = bag;
  }
  return grouped;
}
