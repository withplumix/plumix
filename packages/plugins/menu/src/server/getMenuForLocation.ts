import type { AppContext } from "plumix/plugin";
import { loadSettingsGroups, memoBatch } from "plumix/plugin";

import type { ResolvedMenu } from "./types.js";
import { resolveMenus } from "./getMenuByName.js";

const MENU_LOCATIONS_GROUP = "menu_locations";

/**
 * `null` when the location is unbound or its menu was deleted. Memoized per
 * request, so repeated calls share one resolve.
 */
export async function getMenuForLocation(
  ctx: AppContext,
  location: string,
): Promise<ResolvedMenu | null> {
  const resolved = await getMenusForLocations(ctx, [location]);
  return resolved[location] ?? null;
}

/**
 * Each location's hook pass sees its own `location`, even when two locations
 * bind the same menu.
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
  // Through core's settings loader, so the page is stored under the group's
  // tag even when the location is empty, and a later binding purges it.
  const groups = await loadSettingsGroups(ctx, [MENU_LOCATIONS_GROUP]);
  const bindings = groups[MENU_LOCATIONS_GROUP] ?? {};

  const bound: { location: string; slug: string }[] = [];
  for (const location of locations) {
    const slug = parseTermSlug(bindings[location]);
    if (slug !== null) bound.push({ location, slug });
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
