import type { AppContext } from "plumix/plugin";
import { and, eq, inArray } from "drizzle-orm";
import { memoBatch } from "plumix";
import { settings } from "plumix/plugin";

import type { ResolvedMenu } from "./types.js";
import { resolveMenus } from "./getMenuByName.js";

const MENU_LOCATIONS_GROUP = "menu_locations";

/**
 * Resolve the menu currently bound to a theme-registered location.
 *
 * The slot → term-slug binding lives in the `settings` table under group
 * `menu_locations`, with `key = location` and `value = '<term slug>'`.
 * Reads the binding, then defers to the shared menu resolver. Returns
 * `null` when no binding exists for this location, or when the bound
 * menu has been deleted.
 *
 * Calling this twice for the same location within a single request hits
 * the request memo (`ctx.memo`, #1493) so header + footer + breadcrumb
 * consumers all share one resolve pass; the resolver memoizes its query
 * cluster by slug on the same primitive.
 */
export async function getMenuForLocation(
  ctx: AppContext,
  location: string,
): Promise<ResolvedMenu | null> {
  const resolved = await getMenusForLocations(ctx, [location]);
  return resolved[location] ?? null;
}

/**
 * Batched `getMenuForLocation` (#1518): one settings read covering every
 * location, then one `resolveMenus` pass over the bound slugs — query
 * count flat in the number of locations. Each location's hook pass sees
 * its own `location`, even when two locations bind the same menu.
 */
export async function getMenusForLocations(
  ctx: AppContext,
  locations: readonly string[],
): Promise<Record<string, ResolvedMenu | null>> {
  const resolved = await memoBatch(
    ctx.memo,
    locations,
    (location) => `menu:location:${location}`,
    () => resolveLocations(ctx, locations),
  );
  return Object.fromEntries(
    locations.map((location, i) => [location, resolved[i] ?? null]),
  );
}

async function resolveLocations(
  ctx: AppContext,
  locations: readonly string[],
): Promise<Map<string, ResolvedMenu>> {
  const rows = await ctx.db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(
      and(
        eq(settings.group, MENU_LOCATIONS_GROUP),
        inArray(settings.key, [...locations]),
      ),
    );

  const bound: { location: string; slug: string }[] = [];
  for (const row of rows) {
    const slug = parseTermSlug(row.value);
    if (slug !== null) bound.push({ location: row.key, slug });
  }

  const menus = await resolveMenus(ctx, bound);
  const result = new Map<string, ResolvedMenu>();
  bound.forEach(({ location }, i) => {
    const menu = menus[i];
    if (menu) result.set(location, menu);
  });
  return result;
}

function parseTermSlug(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}
