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
import { now } from "../../../clock.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import {
  loadAuthoredEntries,
  loadAuthoredEntry,
} from "../../../entries/authored.js";
import { assertCanDeleteEntry } from "../../../entries/editability.js";
import { entry } from "../../../events-and-filters/entry.js";
import {
  pruneOldRevisions,
  snapshotAsRevision,
} from "../../../revisions/repository.js";

export async function applyEntryBeforeSave(
  ctx: AppContext,
  type: string,
  prepared: NewEntry,
): Promise<NewEntry> {
  return ctx.filters.apply(entry.for(type).beforeSave, prepared);
}

/** The columns `patch` names, as `beforeSave` left them. */
export function preparedColumns<T extends object>(
  prepared: T,
  patch: Partial<T>,
): Partial<T> {
  const columns: Partial<T> = {};
  for (const key in patch) columns[key] = prepared[key];
  return columns;
}

export async function fireEntryTransition(
  ctx: AppContext,
  row: Entry,
  previousStatus: EntryStatus,
): Promise<void> {
  if (row.status === previousStatus) return;
  await ctx.events.emit(entry.for(row.type).transition, {
    entry: row,
    previousStatus,
  });
}

export async function fireEntryPublished(
  ctx: AppContext,
  row: Entry,
): Promise<void> {
  await ctx.events.emit(entry.for(row.type).published, { entry: row });
}

/**
 * Stamps `now` when there's no publish time yet, or when the scheduled time
 * is still in the future, which would sort it to the top of feeds.
 */
export function publishedAtForTransition(
  existing: Date | null,
): Date | undefined {
  if (existing === null || existing.getTime() > now().getTime()) return now();
  return undefined;
}

export async function fireEntryUpdated(
  ctx: AppContext,
  row: Entry,
  previous: Entry,
): Promise<void> {
  await ctx.events.emit(entry.for(row.type).updated, { entry: row, previous });
}

export async function fireEntryTrashed(
  ctx: AppContext,
  row: Entry,
): Promise<void> {
  await ctx.events.emit(entry.for(row.type).trashed, { entry: row });
}

export async function fireEntryRestored(
  ctx: AppContext,
  row: Entry,
): Promise<void> {
  await ctx.events.emit(entry.for(row.type).restored, { entry: row });
}

export async function fireEntryDeleted(
  ctx: AppContext,
  row: Entry,
): Promise<void> {
  await ctx.events.emit(entry.for(row.type).deleted, { entry: row });
}

/** Keyed on the live entry's type, not the autosave row's `type='autosave'`. */
export async function fireEntryAutosaveSaved(
  ctx: AppContext,
  autosave: Entry,
  live: Entry,
): Promise<void> {
  await ctx.events.emit(entry.for(live.type).autosaveSaved, {
    autosave,
    entry: live,
  });
}

export async function fireEntryAutosaveDiscarded(
  ctx: AppContext,
  live: Entry,
  authorId: number,
): Promise<void> {
  await ctx.events.emit(entry.for(live.type).autosaveDiscarded, {
    entry: live,
    authorId,
  });
}

/**
 * `liveType` is the public type even when the snapshot landed on an
 * autosave row, so subscribers scoped to the type hear it.
 */
export async function fireEntryRevisionRestored(
  ctx: AppContext,
  revision: Entry,
  destination: Entry,
  liveType: string,
): Promise<void> {
  await ctx.events.emit(entry.for(liveType).revisionRestored, {
    revision,
    destination,
  });
}

/**
 * The trash gate is deliberately distinct from `canEditEntry`; don't unify
 * them.
 */
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

/** Pure (no query) gate, shared by the single-row and batched loaders. */
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
  // Dedupe so a repeated id can't double-fire lifecycle events or inflate
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

/**
 * No-op when the type doesn't opt into `supports: ['revisions']`.
 * Emits `entry.revisionCreated` once the snapshot lands;
 * `revisionPruned` only when the cap pushed rows past `maxRevisions`.
 */
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
    apiToken: ctx.apiToken,
  });
  // Prune BEFORE `revisionCreated` is emitted so subscribers see the
  // post-prune list rather than a transient N+1 window.
  const pruned = await pruneOldRevisions(ctx.db, {
    entryId: updated.id,
    maxRevisions: cap,
  });
  const events = entry.for(updated.type);
  await ctx.events.emit(events.revisionCreated, { revision, entry: updated });
  if (pruned > 0) {
    await ctx.events.emit(events.revisionPruned, {
      entry: updated,
      prunedCount: pruned,
    });
  }
}
