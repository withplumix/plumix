import type {
  AppContext,
  AuthenticatedAppContext,
} from "../../../context/app.js";
import type {
  Entry,
  EntryStatus,
  NewEntry,
} from "../../../db/schema/entries.js";
import { eq, inArray } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import {
  pruneOldRevisions,
  snapshotAsRevision,
} from "../../../revisions/repository.js";

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

/**
 * The `publishedAt` to stamp when an entry transitions to `published`, or
 * `undefined` to leave the existing one. Stamps `now` when there's no publish
 * time yet, or when promoting a scheduled entry whose time is still in the
 * future (a future date would sort it to the top of feeds). Shared by the
 * editor update and revision-restore publish paths so they can't diverge.
 */
export function publishedAtForTransition(
  existing: Date | null,
): Date | undefined {
  if (existing === null || existing.getTime() > Date.now()) return new Date();
  return undefined;
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

export async function fireEntryRestored(
  ctx: AppContext,
  entry: Entry,
): Promise<void> {
  await ctx.hooks.doAction(`entry:${entry.type}:restored`, entry);
  await ctx.hooks.doAction("entry:restored", entry);
}

export async function fireEntryDeleted(
  ctx: AppContext,
  entry: Entry,
): Promise<void> {
  await ctx.hooks.doAction(`entry:${entry.type}:deleted`, entry);
  await ctx.hooks.doAction("entry:deleted", entry);
}

// Type-specific event keys on the live entry's type — the autosave row
// itself carries `type='autosave'`, but subscribers care about the
// type of the entry being edited (e.g. `entry:post:autosave_saved`),
// not the framework storage type.
export async function fireEntryAutosaveSaved(
  ctx: AppContext,
  autosave: Entry,
  live: Entry,
): Promise<void> {
  await ctx.hooks.doAction(`entry:${live.type}:autosave_saved`, autosave, live);
  await ctx.hooks.doAction("entry:autosave_saved", autosave, live);
}

export async function fireEntryAutosaveDiscarded(
  ctx: AppContext,
  live: Entry,
  authorId: number,
): Promise<void> {
  await ctx.hooks.doAction(
    `entry:${live.type}:autosave_discarded`,
    live,
    authorId,
  );
  await ctx.hooks.doAction("entry:autosave_discarded", live, authorId);
}

// `destination` is the row the snapshot landed on — autosave for
// autosave-supporting types, live otherwise. `liveType` is always the
// public entry type (the destination's type is `'autosave'` for
// per-user pending edits) so subscribers fire under the same namespace
// regardless of where the snapshot landed.
export async function fireEntryRevisionRestored(
  ctx: AppContext,
  revision: Entry,
  destination: Entry,
  liveType: string,
): Promise<void> {
  await ctx.hooks.doAction(
    `entry:${liveType}:revision_restored`,
    revision,
    destination,
  );
  await ctx.hooks.doAction("entry:revision_restored", revision, destination);
}

export function entryCapability(type: string, action: string): string {
  return `entry:${type}:${action}`;
}

/**
 * Shared prelude for the trash-lifecycle procedures (trash / restore /
 * deletePermanent): load-or-404, then gate on the `delete` capability
 * plus author-or-`edit_any`. Deliberately distinct from the edit gate in
 * `update.ts` (`(author AND edit_own) OR edit_any`, no `delete` cap) —
 * don't unify them.
 */
interface DeletableGuards {
  readonly notFound: (id: number) => never;
  readonly forbidden: (capability: string) => never;
}

// The trash-lifecycle procedures (single + bulk) all translate a missing
// row into NOT_FOUND and a failed cap into FORBIDDEN. `errors` is the
// per-handler oRPC builder, so this is a thin shared adapter.
export function entryDeletableGuards(errors: {
  NOT_FOUND: (opts: { data: { kind: string; id: number } }) => Error;
  FORBIDDEN: (opts: { data: { capability: string } }) => Error;
}): DeletableGuards {
  return {
    notFound: (id) => {
      throw errors.NOT_FOUND({ data: { kind: "entry", id } });
    },
    forbidden: (capability) => {
      throw errors.FORBIDDEN({ data: { capability } });
    },
  };
}

// Pure (no query) gate: `delete` cap plus author-or-`edit_any`. Shared by
// the single-row and batched loaders.
function assertDeletable(
  ctx: AuthenticatedAppContext,
  entry: Entry,
  guards: DeletableGuards,
): void {
  const deleteCapability = entryCapability(entry.type, "delete");
  if (!ctx.auth.can(deleteCapability)) guards.forbidden(deleteCapability);
  if (entry.authorId !== ctx.user.id) {
    const editAnyCapability = entryCapability(entry.type, "edit_any");
    if (!ctx.auth.can(editAnyCapability)) guards.forbidden(editAnyCapability);
  }
}

export async function loadDeletableEntry(
  ctx: AuthenticatedAppContext,
  id: number,
  guards: DeletableGuards,
): Promise<Entry> {
  const existing = await ctx.db.query.entries.findFirst({
    where: eq(entries.id, id),
  });
  if (!existing) guards.notFound(id);
  assertDeletable(ctx, existing, guards);
  return existing;
}

/**
 * Batched sibling of `loadDeletableEntry` for the bulk procedures: one
 * `WHERE id IN (…)` read (no N+1), then per-row gating in memory.
 * Fail-all — any missing id or any forbidden row throws, so a bulk op
 * never half-applies across a mix of permitted and forbidden entries.
 */
export async function loadDeletableEntries(
  ctx: AuthenticatedAppContext,
  ids: readonly number[],
  guards: DeletableGuards,
): Promise<Entry[]> {
  // Dedupe so a repeated id can't double-fire lifecycle hooks or inflate
  // the result count — bulk ops act on each entry once.
  const uniqueIds = [...new Set(ids)];
  const rows = await ctx.db.query.entries.findMany({
    where: inArray(entries.id, uniqueIds),
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered: Entry[] = [];
  for (const id of uniqueIds) {
    const row = byId.get(id);
    if (!row) guards.notFound(id);
    assertDeletable(ctx, row, guards);
    ordered.push(row);
  }
  return ordered;
}

// Mirrors the readability rules in `entry.get`: any type-level `read` cap,
// and for non-published entries also requires `edit_any` or (author +
// `edit_own`). `entry.get` inlines its own variant that also issues an
// errors.NOT_FOUND directly; `entry.duplicate` reuses this to gate the
// source it copies (a create cap alone would leak unreadable drafts).
export function canReadEntry(
  ctx: AuthenticatedAppContext,
  entry: Entry,
): boolean {
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

// No-op when the type doesn't opt into `supports: ['revisions']`.
// Fires `entry:<type>:revision_created` + the generic variant once
// the snapshot lands; `revision_pruned` only fires when the cap
// pushed rows past `maxRevisions`.
export async function captureRevisionIfSupported(
  ctx: AuthenticatedAppContext,
  updated: Entry,
): Promise<void> {
  const typeEntry = ctx.plugins.entryTypes.get(updated.type);
  if (!typeEntry?.supports?.includes("revisions")) return;
  const cap = typeEntry.versioning?.maxRevisions ?? 25;
  const revision = await snapshotAsRevision(ctx.db, {
    entry: updated,
    authorId: ctx.user.id,
  });
  // Prune BEFORE the created hook fires so subscribers see the
  // post-prune list rather than a transient N+1 window.
  const pruned = await pruneOldRevisions(ctx.db, {
    entryId: updated.id,
    maxRevisions: cap,
  });
  await ctx.hooks.doAction(
    `entry:${updated.type}:revision_created`,
    revision,
    updated,
  );
  await ctx.hooks.doAction("entry:revision_created", revision, updated);
  if (pruned > 0) {
    await ctx.hooks.doAction(
      `entry:${updated.type}:revision_pruned`,
      updated,
      pruned,
    );
    await ctx.hooks.doAction("entry:revision_pruned", updated, pruned);
  }
}
