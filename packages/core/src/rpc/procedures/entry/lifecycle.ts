import type {
  AppContext,
  AuthenticatedAppContext,
} from "../../../context/app-context.js";
import type {
  Entry,
  EntryStatus,
  NewEntry,
} from "../../../db/schema/entries.js";
import type { GatedLookupErrors } from "../../../rpc-errors.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import {
  loadAuthoredEntries,
  loadAuthoredEntry,
} from "../../../entries/authored.js";
import { assertCanDeleteEntry } from "../../../entries/editability.js";
import {
  pruneOldRevisions,
  snapshotAsRevision,
} from "../../../revisions/repository.js";

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
  await ctx.hooks.doAction(
    `entry:${entry.type}:transition`,
    entry,
    oldStatus,
    ctx,
  );
  await ctx.hooks.doAction("entry:transition", entry, oldStatus, ctx);
}

export async function fireEntryPublished(
  ctx: AppContext,
  entry: Entry,
): Promise<void> {
  await ctx.hooks.doAction(`entry:${entry.type}:published`, entry, ctx);
  await ctx.hooks.doAction("entry:published", entry, ctx);
}

/**
 * Stamps `now` when there's no publish time yet, or when the scheduled time
 * is still in the future, which would sort it to the top of feeds.
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
  await ctx.hooks.doAction(`entry:${entry.type}:updated`, entry, previous, ctx);
  await ctx.hooks.doAction("entry:updated", entry, previous, ctx);
}

export async function fireEntryTrashed(
  ctx: AppContext,
  entry: Entry,
): Promise<void> {
  await ctx.hooks.doAction(`entry:${entry.type}:trashed`, entry, ctx);
  await ctx.hooks.doAction("entry:trashed", entry, ctx);
}

export async function fireEntryRestored(
  ctx: AppContext,
  entry: Entry,
): Promise<void> {
  await ctx.hooks.doAction(`entry:${entry.type}:restored`, entry, ctx);
  await ctx.hooks.doAction("entry:restored", entry, ctx);
}

export async function fireEntryDeleted(
  ctx: AppContext,
  entry: Entry,
): Promise<void> {
  await ctx.hooks.doAction(`entry:${entry.type}:deleted`, entry, ctx);
  await ctx.hooks.doAction("entry:deleted", entry, ctx);
}

/** Keyed on the live entry's type, not the autosave row's `type='autosave'`. */
export async function fireEntryAutosaveSaved(
  ctx: AppContext,
  autosave: Entry,
  live: Entry,
): Promise<void> {
  await ctx.hooks.doAction(
    `entry:${live.type}:autosave_saved`,
    autosave,
    live,
    ctx,
  );
  await ctx.hooks.doAction("entry:autosave_saved", autosave, live, ctx);
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
    ctx,
  );
  await ctx.hooks.doAction("entry:autosave_discarded", live, authorId, ctx);
}

/**
 * `liveType` is the public type even when the snapshot landed on an
 * autosave row, so subscribers fire under the same namespace.
 */
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
    ctx,
  );
  await ctx.hooks.doAction(
    "entry:revision_restored",
    revision,
    destination,
    ctx,
  );
}

// The trash gate is deliberately distinct from `canEditEntry`; don't unify
// them.
interface DeletableGuards {
  readonly notFound: (id: number) => never;
  readonly errors: GatedLookupErrors;
}

export function entryDeletableGuards(
  errors: GatedLookupErrors,
): DeletableGuards {
  return {
    notFound: (id) => {
      throw errors.NOT_FOUND({ data: { kind: "entry", id } });
    },
    errors,
  };
}

// Pure (no query) gate, shared by the single-row and batched loaders.
function assertDeletable(
  ctx: AuthenticatedAppContext,
  entry: Entry,
  guards: DeletableGuards,
): void {
  assertCanDeleteEntry(ctx, entry, guards.errors);
}

export async function loadDeletableEntry(
  ctx: AuthenticatedAppContext,
  id: number,
  guards: DeletableGuards,
): Promise<Entry> {
  const existing = await loadAuthoredEntry(ctx.db, id);
  if (!existing) guards.notFound(id);
  assertDeletable(ctx, existing, guards);
  return existing;
}

/**
 * Fail-all: any missing or forbidden id throws, so a bulk op never
 * half-applies.
 */
export async function loadDeletableEntries(
  ctx: AuthenticatedAppContext,
  ids: readonly number[],
  guards: DeletableGuards,
): Promise<Entry[]> {
  // Dedupe so a repeated id can't double-fire lifecycle hooks or inflate
  // the result count — bulk ops act on each entry once.
  const uniqueIds = [...new Set(ids)];
  const rows = await loadAuthoredEntries(ctx.db, uniqueIds);
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

/**
 * Also returns true when the chain exceeds the depth cap or walks into a
 * pre-existing cycle; treat true as reject.
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
    ctx,
  );
  await ctx.hooks.doAction("entry:revision_created", revision, updated, ctx);
  if (pruned > 0) {
    await ctx.hooks.doAction(
      `entry:${updated.type}:revision_pruned`,
      updated,
      pruned,
      ctx,
    );
    await ctx.hooks.doAction("entry:revision_pruned", updated, pruned, ctx);
  }
}
