import type { AppContext, EntryAccessSubject } from "plumix/plugin";
import { entryAllowsAnonymousAccess } from "plumix";

/**
 * Whether an entry may have a card at all — the one question the route and the
 * head both ask, so the head can never advertise a URL the route refuses.
 *
 * Status is checked because the head reaches this on a preview render, where
 * the entry is a draft. An unregistered type — a row left behind by a plugin
 * the config no longer installs — has no public page either, so it answers the
 * same as a private one.
 *
 * The access layer is asked last, and asked about an anonymous visitor whoever
 * is calling: a card carries the entry's title, sits at an enumerable id, and
 * is served from a shared cache, so an entry whose own page a scraper never
 * reaches must not have one either.
 */
export async function isShareableEntry(
  ctx: AppContext,
  entry: EntryAccessSubject & { readonly status: string },
): Promise<boolean> {
  if (entry.status !== "published") return false;
  const entryType = ctx.plugins.entryTypes.get(entry.type);
  if (entryType === undefined || entryType.isPublic === false) return false;
  return entryAllowsAnonymousAccess(ctx, entry);
}
