import type { AppContext } from "plumix/plugin";
import { and, eq } from "drizzle-orm";
import { settings } from "plumix/plugin";

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
 * the request memo (`ctx.memo`, #1493) so header + footer + breadcrumb
 * consumers all share one resolve pass; `getMenuByName` memoizes its
 * query cluster by slug on the same primitive.
 */
export async function getMenuForLocation(
  ctx: AppContext,
  location: string,
): Promise<ResolvedMenu | null> {
  return ctx.memo(`menu:location:${location}`, () =>
    resolveLocation(ctx, location),
  );
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
