import type { AppContext } from "plumix/plugin";

/**
 * Whether an entry may have a card at all — the one question the route and the
 * head both ask, so the head can never advertise a URL the route refuses.
 *
 * Status is checked because the head reaches this on a preview render, where
 * the entry is a draft. An unregistered type — a row left behind by a plugin
 * the config no longer installs — has no public page either, so it answers the
 * same as a private one.
 */
export function isShareableEntry(
  ctx: AppContext,
  entry: { readonly status: string; readonly type: string },
): boolean {
  if (entry.status !== "published") return false;
  const entryType = ctx.plugins.entryTypes.get(entry.type);
  return entryType !== undefined && entryType.isPublic !== false;
}
