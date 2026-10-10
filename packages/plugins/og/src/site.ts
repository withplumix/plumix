import type { AppContext } from "plumix/plugin";

import { loadSeoSettings } from "@plumix/plugin-seo";

/** Resolved against the origin, since the setting may hold a bare path. */
export async function siteDefaultImage(
  ctx: AppContext,
): Promise<string | null> {
  const value = (await loadSeoSettings(ctx)).defaultOgImage;
  return value === null ? null : (URL.parse(value, ctx.origin)?.href ?? null);
}
