import type { AppContext, AuthenticatedAppContext } from "../context/app.js";
import type { SQL } from "../db/index.js";
import type { Entry } from "../db/schema/entries.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { and, eq, inArray, isNotNull, or, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { publicEntryTypeNames } from "../plugin/registry.js";
import { entryCapability, entryCapabilityNamespace } from "./capabilities.js";

export type EntryViewer = Pick<AppContext, "user" | "auth" | "plugins">;

// `authorId` admits `null` so a caller can ask about a hypothetical row "by
// the current user", who may be nobody.
export interface EntryRow {
  readonly type: Entry["type"];
  readonly status: Entry["status"];
  readonly authorId: Entry["authorId"] | null;
}

/**
 * May this caller see this entry row? The one answer for every read surface.
 * Trash is a status like any other here — a surface that hides the bin says
 * so itself. `readableEntryRows` is the same rule as SQL; its tests hold the
 * two to the same rows, so a change to one fails until the other follows.
 */
export function canReadEntry(ctx: EntryViewer, entry: EntryRow): boolean {
  const namespace = entryCapabilityNamespace(ctx.plugins, entry.type);
  if (!ctx.auth.can(entryCapability(namespace, "read"))) return false;
  if (entry.status === "published") return true;
  if (!canReadUnpublished(ctx, entry.type)) return false;
  return (
    ctx.auth.can(entryCapability(namespace, "edit_any")) ||
    entry.authorId === ctx.user?.id
  );
}

/**
 * Whether any unpublished row of `type` can reach this caller at all:
 * `edit_any`, or `edit_own` with someone signed in to own a row.
 */
export function canReadUnpublished(ctx: EntryViewer, type: string): boolean {
  const namespace = entryCapabilityNamespace(ctx.plugins, type);
  return (
    ctx.auth.can(entryCapability(namespace, "edit_any")) ||
    (ctx.user !== null && ctx.auth.can(entryCapability(namespace, "edit_own")))
  );
}

/**
 * `canReadEntry` over the rows of one `type`, as a WHERE clause, or `null`
 * when the caller may not read the type at all. Parenthesized, so it can be
 * `AND`ed onto a caller's own predicate.
 */
export function readableEntryRows(ctx: EntryViewer, type: string): SQL | null {
  const namespace = entryCapabilityNamespace(ctx.plugins, type);
  if (!ctx.auth.can(entryCapability(namespace, "read"))) return null;
  return referenceableEntryRows(ctx, type);
}

/**
 * The rows of one `type` a *reference* to it may resolve to: the published
 * ones, plus the unpublished ones this caller has earned.
 *
 * {@link readableEntryRows} with the `read` gate not asked, and the one place
 * that difference is right. A reference is hydrated inline inside someone
 * else's page — the referenced type often has no page of its own, so no
 * reader of it holds a capability over it, and `buildEntryPermalink` already
 * answers `null` for such a type rather than treating it as a mistake.
 * Publication is the whole gate on that half. The unpublished half still runs
 * through the same earning `canReadEntry` requires.
 */
export function referenceableEntryRows(ctx: EntryViewer, type: string): SQL {
  const ofType = eq(entries.type, type);
  const published = and(ofType, eq(entries.status, "published"));
  const earned = earnedUnpublishedRows(ctx, type);
  return earned === null
    ? sql`(${published})`
    : sql`(${or(published, earned)})`;
}

/**
 * The rows of `type` this caller may see *unpublished*, or `null` where none
 * are: the SQL half of {@link canReadUnpublished}, under the same `read` gate
 * every other unpublished read runs through.
 */
function earnedUnpublishedRows(ctx: EntryViewer, type: string): SQL | null {
  const namespace = entryCapabilityNamespace(ctx.plugins, type);
  if (!ctx.auth.can(entryCapability(namespace, "read"))) return null;
  const ofType = eq(entries.type, type);
  if (ctx.auth.can(entryCapability(namespace, "edit_any"))) {
    return sql`(${ofType})`;
  }
  if (!canReadUnpublished(ctx, type) || ctx.user === null) return null;
  return sql`(${and(ofType, eq(entries.authorId, ctx.user.id))})`;
}

/**
 * The public entries — published, with a publish date, of a public type — as a
 * WHERE clause, or `null` where the site routes no public type at all and
 * there is nothing an anonymous reader could be shown.
 *
 * Deliberately not `readableEntryRows`: that is the viewer's set, and it
 * varies per user. This one is the same for everybody, which is what lets an
 * archive page be stored in a CDN and read by a feed. Parenthesized, so it can
 * be `AND`ed onto a caller's own predicate.
 */
export function publicEntryRows(plugins: PluginRegistry): SQL | null {
  const types = publicEntryTypeNames(plugins);
  if (types.length === 0) return null;
  return sql`(${and(
    inArray(entries.type, types),
    eq(entries.status, "published"),
    isNotNull(entries.publishedAt),
  )})`;
}

/**
 * Load the parent referenced by a user-supplied parentId and verify it
 * (a) exists, (b) shares the child's entry type, and (c) is visible to the
 * caller. Returns null when any check fails — deliberately undistinguished so
 * a caller can't probe for entry existence by reparenting. Callers should
 * translate null into a 404.
 */
export async function loadReadableParent(
  ctx: AuthenticatedAppContext,
  childType: string,
  parentId: number,
): Promise<Entry | null> {
  const parent = await ctx.db.query.entries.findFirst({
    where: eq(entries.id, parentId),
  });
  if (!parent) return null;
  if (parent.type !== childType) return null;
  if (!canReadEntry(ctx, parent)) return null;
  return parent;
}
