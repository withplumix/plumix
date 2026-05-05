import { and, eq } from "drizzle-orm";

import type { AppContext } from "@plumix/core";
import { settings } from "@plumix/core";

import type { ResolvedMenu } from "./types.js";
import { getMenuByName } from "./getMenuByName.js";

const MENU_LOCATIONS_GROUP = "menu_locations";

/**
 * Resolve the menu currently bound to a theme-registered location.
 *
 * The slot → term-slug binding lives in the `settings` table under group
 * `menu_locations`, with `key = location` and `value = '<term slug>'`.
 * Reads the binding, then defers to `getMenuByName` for the actual
 * resolution. Returns `null` when no binding exists for this location, or
 * when the bound menu has been deleted.
 *
 * Calling this twice for the same location within a single request hits
 * a request-scoped cache stashed on `AppContext` so header + footer +
 * breadcrumb consumers all share one resolve pass.
 */
export async function getMenuForLocation(
  ctx: AppContext,
  location: string,
): Promise<ResolvedMenu | null> {
  const cache = getOrCreateRequestCache(ctx);
  if (cache.has(location)) {
    return cache.get(location) ?? null;
  }
  const resolved = await resolveLocation(ctx, location);
  cache.set(location, resolved);
  return resolved;
}

async function resolveLocation(
  ctx: AppContext,
  location: string,
): Promise<ResolvedMenu | null> {
  const [row] = await ctx.db
    .select({ value: settings.value })
    .from(settings)
    .where(
      and(eq(settings.group, MENU_LOCATIONS_GROUP), eq(settings.key, location)),
    )
    .limit(1);
  if (!row) return null;
  const slug = parseTermSlug(row.value);
  if (slug === null) return null;
  return getMenuByName(ctx, slug, { location });
}

function parseTermSlug(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

// WeakMap keyed by ctx identity. If a caller reused an `AppContext` across
// requests (no current code path does, but nothing in the type forbids it),
// they'd leak menu state via the cache. WeakMap means the cache dies with
// the ctx, and a non-registry Symbol can't collide with another module.
const requestCaches = new WeakMap<
  AppContext,
  Map<string, ResolvedMenu | null>
>();

function getOrCreateRequestCache(
  ctx: AppContext,
): Map<string, ResolvedMenu | null> {
  let cache = requestCaches.get(ctx);
  if (!cache) {
    cache = new Map();
    requestCaches.set(ctx, cache);
  }
  return cache;
}
