import type {
  AppContext,
  AuthenticatedAppContext,
} from "../../../context/app.js";
import type {
  Entry,
  EntryStatus,
  NewEntry,
} from "../../../db/schema/entries.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";

// Each lifecycle event fan-outs to two hook names: the type-scoped form
// `entry:<type>:<event>` (targets one entry type) and the generic
// `entry:<event>` (fires for every entry regardless of type). Plugins
// subscribe to whichever granularity they need — no need to re-filter by
// type inside a generic handler.

export async function applyEntryBeforeSave(
  ctx: AppContext,
  type: string,
  entry: NewEntry,
): Promise<NewEntry> {
  const afterSpecific = await ctx.hooks.applyFilter(
    `entry:${type}:before_save`,
    entry,
  );
  return ctx.hooks.applyFilter("entry:before_save", afterSpecific);
}

export async function fireEntryTransition(
  ctx: AppContext,
  entry: Entry,
  oldStatus: EntryStatus,
): Promise<void> {
  if (entry.status === oldStatus) return;
  await ctx.hooks.doAction(`entry:${entry.type}:transition`, entry, oldStatus);
  await ctx.hooks.doAction("entry:transition", entry, oldStatus);
}

export async function fireEntryPublished(
  ctx: AppContext,
  entry: Entry,
): Promise<void> {
  await ctx.hooks.doAction(`entry:${entry.type}:published`, entry);
  await ctx.hooks.doAction("entry:published", entry);
}

export async function fireEntryUpdated(
  ctx: AppContext,
  entry: Entry,
  previous: Entry,
): Promise<void> {
  await ctx.hooks.doAction(`entry:${entry.type}:updated`, entry, previous);
  await ctx.hooks.doAction("entry:updated", entry, previous);
}

export async function fireEntryTrashed(
  ctx: AppContext,
  entry: Entry,
): Promise<void> {
  await ctx.hooks.doAction(`entry:${entry.type}:trashed`, entry);
  await ctx.hooks.doAction("entry:trashed", entry);
}

export function entryCapability(type: string, action: string): string {
  return `${type}:${action}`;
}

// Mirrors the readability rules in `entry.get`: any type-level `read` cap,
// and for non-published entries also requires `edit_any` or (author +
// `edit_own`). Kept local because this is the only call site — `entry.get`
// inlines its own variant that also issues an errors.NOT_FOUND directly.
function canReadEntry(ctx: AuthenticatedAppContext, entry: Entry): boolean {
  if (!ctx.auth.can(entryCapability(entry.type, "read"))) return false;
  if (entry.status === "published") return true;
  if (ctx.auth.can(entryCapability(entry.type, "edit_any"))) return true;
  return (
    entry.authorId === ctx.user.id &&
    ctx.auth.can(entryCapability(entry.type, "edit_own"))
  );
}

/**
 * Load the parent referenced by a user-supplied parentId and verify it
 * (a) exists, (b) shares the child's entry type, and (c) is visible to the
 * caller per the same rules as `entry.get`. Returns null when any check
 * fails — deliberately undistinguished so a caller can't probe for entry
 * existence by reparenting. Callers should translate null into a 404.
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

/**
 * Walk the parent chain upward from `candidateParentId` and decide whether
 * pointing `entryId` at it would create a cycle — i.e. whether entryId already
 * appears in the chain above candidateParentId. Returns true on any cycle
 * (including a pre-existing one walked into on the way up) or when the chain
 * exceeds a sanity limit; callers should treat true as "reject".
 *
 * Necessary because update.ts alone can't catch cycles of depth > 1
 * (A→B→A) from a self-id check; admin UI tree views will infinite-loop on
 * any such cycle left in the DB.
 */
export async function wouldCreateParentCycle(
  ctx: AuthenticatedAppContext,
  entryId: number,
  candidateParentId: number,
): Promise<boolean> {
  const MAX_DEPTH = 64;
  const visited = new Set<number>();
  let cursor: number | null = candidateParentId;
  while (cursor !== null) {
    if (cursor === entryId) return true;
    if (visited.has(cursor)) return true;
    if (visited.size >= MAX_DEPTH) return true;
    visited.add(cursor);
    const next: Entry | undefined = await ctx.db.query.entries.findFirst({
      where: eq(entries.id, cursor),
    });
    cursor = next?.parentId ?? null;
  }
  return false;
}
