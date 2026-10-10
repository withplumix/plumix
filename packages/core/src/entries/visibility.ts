import type {
  AppContext,
  AuthenticatedAppContext,
} from "../context/app-context.js";
import type { SQL } from "../db/index.js";
import type { Entry } from "../db/schema/entries.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import {
  entryCapabilityNamespace,
  namespacedEntryCapability,
} from "../access/contract/entry-capabilities.js";
import { and, eq, inArray, isNotNull, or, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { publicEntryTypeNames } from "../plugin/registry.js";

export type EntryViewer = Pick<AppContext, "user" | "auth" | "plugins">;

// `authorId` admits `null` so a caller can ask about a hypothetical row "by
// the current user", who may be nobody.
export interface EntryRow {
  readonly type: Entry["type"];
  readonly status: Entry["status"];
  readonly authorId: Entry["authorId"] | null;
}

/**
 * Trash is a status like any other here. `readableEntryRows` is the same rule
 * as SQL, and their tests hold the two to the same rows.
 */
export function canReadEntry(ctx: EntryViewer, entry: EntryRow): boolean {
  const namespace = entryCapabilityNamespace(ctx.plugins, entry.type);
  if (!ctx.auth.can(namespacedEntryCapability(namespace, "read"))) return false;
  if (entry.status === "published") return true;
  if (!canReadUnpublished(ctx, entry.type)) return false;
  return (
    ctx.auth.can(namespacedEntryCapability(namespace, "edit_any")) ||
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
    ctx.auth.can(namespacedEntryCapability(namespace, "edit_any")) ||
    (ctx.user !== null &&
      ctx.auth.can(namespacedEntryCapability(namespace, "edit_own")))
  );
}

/**
 * `null` when the caller may not read the type at all. Parenthesized, so it
 * can be `AND`ed onto a caller's predicate.
 */
export function readableEntryRows(ctx: EntryViewer, type: string): SQL | null {
  const namespace = entryCapabilityNamespace(ctx.plugins, type);
  if (!ctx.auth.can(namespacedEntryCapability(namespace, "read"))) return null;
  return referenceableEntryRows(ctx, type);
}

/**
 * Skips the `read` gate: a referenced type often has no page, so no reader
 * holds a capability over it. Publication gates the published half.
 */
export function referenceableEntryRows(ctx: EntryViewer, type: string): SQL {
  const ofType = eq(entries.type, type);
  const published = and(ofType, eq(entries.status, "published"));
  const earned = earnedUnpublishedRows(ctx, type);
  return earned === null
    ? sql`(${published})`
    : sql`(${or(published, earned)})`;
}

// The SQL half of `canReadUnpublished`, under the same `read` gate.
function earnedUnpublishedRows(ctx: EntryViewer, type: string): SQL | null {
  const namespace = entryCapabilityNamespace(ctx.plugins, type);
  if (!ctx.auth.can(namespacedEntryCapability(namespace, "read"))) return null;
  const ofType = eq(entries.type, type);
  if (ctx.auth.can(namespacedEntryCapability(namespace, "edit_any"))) {
    return sql`(${ofType})`;
  }
  if (!canReadUnpublished(ctx, type) || ctx.user === null) return null;
  return sql`(${and(ofType, eq(entries.authorId, ctx.user.id))})`;
}

/**
 * Not `readableEntryRows`: this set is the same for everybody, so an archive
 * page can be cached and read by a feed. `null` when no type is public.
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
 * Null when the parent is missing, of another type, or unreadable, all alike
 * so reparenting can't probe for existence. Translate null into a 404.
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
