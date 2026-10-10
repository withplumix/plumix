import { and, desc, eq, gte, inArray, like, lt, ne, or } from "drizzle-orm";

import type { Db } from "../context/app-context.js";
import type { Entry, EntryContent } from "../db/schema/entries.js";
import type { JsonObject } from "../json.js";
import { ACCESS_POLICY_META_KEY } from "../access/contract/meta-key.js";
import { isUniqueConstraintError } from "../db/errors.js";
import { entries } from "../db/schema/entries.js";
import { NAMED_TEMPLATE_META_KEY } from "../route/contract/named-template.js";
import { RevisionRepositoryError } from "./errors.js";
import {
  AUTOSAVE_TYPE,
  buildAutosaveSlug,
  buildRevisionSlug,
  REVISION_TYPE,
} from "./slug-codec.js";
import {
  asDraftRow,
  encodeSnapshotEnvelope,
  REVISION_MESSAGE_META_KEY,
  stripReservedMeta,
} from "./snapshot-envelope.js";

// 21 chars × 64-char alphabet = 126 bits of entropy — collision-
// resistant under the `(type, slug)` unique index. URL-safe.
const NANOID_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";

function generateNanoid(length = 21): string {
  // crypto.getRandomValues so an attacker who learns one revision slug
  // can't predict the next one (Math.random is seeded predictably).
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += NANOID_ALPHABET.charAt(byte & 63);
  }
  return out;
}

interface SnapshotInput {
  readonly entry: Entry;
  readonly authorId: number;
}

/**
 * Retries only on a unique-index collision (a nanoid coincidence), so schema
 * or FK bugs aren't masked as retry candidates.
 */
export async function snapshotAsRevision(
  db: Db,
  input: SnapshotInput,
): Promise<Entry> {
  const { entry, authorId } = input;
  const meta = {
    ...entry.meta,
    ...encodeSnapshotEnvelope({ slug: entry.slug, parentId: entry.parentId }),
  };
  async function attempt(): Promise<Entry> {
    const [row] = await db
      .insert(entries)
      .values({
        type: REVISION_TYPE,
        parentId: null,
        title: entry.title,
        slug: buildRevisionSlug({
          entryId: entry.id,
          nanoid: generateNanoid(),
        }),
        content: entry.content,
        excerpt: entry.excerpt,
        status: entry.status,
        authorId,
        sortOrder: 0,
        meta,
        publishedAt: entry.publishedAt,
      })
      .returning();
    if (!row) throw RevisionRepositoryError.insertReturnedNoRow();
    return row;
  }
  try {
    return await attempt();
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
    return attempt();
  }
}

interface ListRevisionsInput {
  readonly entryId: number;
  readonly limit: number;
  // Opaque cursor returned by the previous page (last row's id as a
  // base-10 string). `id` is autoincrement and revisions are insert-
  // only, so id-ordering is chronological without same-second ties.
  readonly cursor?: string | null;
}

interface ListRevisionsPage {
  readonly revisions: readonly Entry[];
  readonly nextCursor: string | null;
}

function decodeCursor(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Filtering in SQL, not JS after a `type='revision'` query, which would lose
// rows once the limit window saturates on noisy neighbours.
function entryRevisionPrefix(entryId: number): string {
  return `revision:${String(entryId)}:%`;
}

export async function listRevisions(
  db: Db,
  input: ListRevisionsInput,
): Promise<ListRevisionsPage> {
  const cursor = decodeCursor(input.cursor);
  const baseFilter = and(
    eq(entries.type, REVISION_TYPE),
    like(entries.slug, entryRevisionPrefix(input.entryId)),
  );
  const rows = await db.query.entries.findMany({
    where: cursor ? and(baseFilter, lt(entries.id, cursor)) : baseFilter,
    orderBy: [desc(entries.id)],
    limit: input.limit + 1,
  });
  const trimmed = rows.slice(0, input.limit);
  const hasMore = rows.length > input.limit;
  const last = trimmed.at(-1);
  return {
    revisions: trimmed,
    nextCursor: hasMore && last ? String(last.id) : null,
  };
}

export async function getRevision(
  db: Db,
  input: { readonly revisionId: number },
): Promise<Entry | undefined> {
  const row = await db.query.entries.findFirst({
    where: and(
      eq(entries.id, input.revisionId),
      eq(entries.type, REVISION_TYPE),
    ),
  });
  return row;
}

interface UpsertAutosaveInput {
  /**
   * Its slug and parentId are snapshotted so `entry.publish` can restore them
   * without a round trip.
   */
  readonly entry: Entry;
  // The user editing. Combined with `entry.id` to produce the
  // deterministic slug — UNIQUE (type, slug) enforces "one autosave
  // per (entry, user)" without an extra dedup query.
  readonly authorId: number;
  readonly patch: {
    readonly title: string;
    readonly content: EntryContent | null;
    readonly excerpt: string | null;
    // The keys the author touched, and the keys they cleared. Not the whole
    // bag — see ADR 0003.
    readonly meta: JsonObject;
    readonly metaDeletes: readonly string[];
  };
}

/**
 * Returns the row so callers can read `updatedAt`, the optimistic-concurrency
 * token for the next save.
 */
export async function upsertAutosave(
  db: Db,
  input: UpsertAutosaveInput,
): Promise<Entry> {
  const { entry, authorId, patch } = input;
  const meta = {
    ...patch.meta,
    ...encodeSnapshotEnvelope({
      slug: entry.slug,
      parentId: entry.parentId,
      deletes: patch.metaDeletes,
    }),
  };
  const slug = buildAutosaveSlug({ entryId: entry.id, authorId });
  const [row] = await db
    .insert(entries)
    .values({
      type: AUTOSAVE_TYPE,
      parentId: null,
      title: patch.title,
      slug,
      content: patch.content,
      excerpt: patch.excerpt,
      status: entry.status,
      authorId,
      sortOrder: 0,
      meta,
      publishedAt: entry.publishedAt,
    })
    .onConflictDoUpdate({
      target: [entries.type, entries.slug],
      // Identity (type, slug, authorId) is fixed by the deterministic slug;
      // only editable fields and the envelope change.
      set: {
        title: patch.title,
        content: patch.content,
        excerpt: patch.excerpt,
        meta,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw RevisionRepositoryError.insertReturnedNoRow();
  return row;
}

/** Which entry, and whose pending draft of it — autosaves are per author. */
export interface AutosavePairInput {
  readonly entryId: number;
  readonly authorId: number;
}

/**
 * The author's edits laid over the live entry, since a preview is a page, not
 * a diff. Use {@link getAutosaveEdits} on the write path.
 */
export async function getAutosave(
  db: Db,
  input: AutosavePairInput,
  // Stored, not resolved: the merge lays edits over the column's bag, so a
  // caller holding a resolved row omits this.
  storedLive?: Entry,
): Promise<Entry | undefined> {
  const edits = await getAutosaveEdits(db, input);
  if (!edits) return undefined;
  const liveRow =
    storedLive ??
    (await db.query.entries.findFirst({
      where: eq(entries.id, input.entryId),
    }));
  // An autosave outliving its entry has no bag to lay the edits over.
  if (!liveRow) return undefined;
  return asDraftRow(liveRow, edits);
}

/**
 * Only drafted fields come from the autosave; `title`, `slug`, `parentId`,
 * terms and the access choice stay live, since the gate reads the persisted
 * row. A trashed entry passes through.
 */
export function overlayAutosave(live: Entry, autosave: Entry): Entry {
  if (live.status === "trash") return live;
  const drafted = stripReservedMeta(autosave.meta, [NAMED_TEMPLATE_META_KEY]);
  const choice = live.meta[ACCESS_POLICY_META_KEY];
  return {
    ...live,
    content: autosave.content,
    excerpt: autosave.excerpt,
    meta:
      choice === undefined
        ? drafted
        : { ...drafted, [ACCESS_POLICY_META_KEY]: choice },
  };
}

/** Its meta is the author's edits only, not the whole bag. */
export async function getAutosaveEdits(
  db: Db,
  input: AutosavePairInput,
): Promise<Entry | undefined> {
  return db.query.entries.findFirst({
    where: and(
      eq(entries.type, AUTOSAVE_TYPE),
      eq(entries.slug, buildAutosaveSlug(input)),
    ),
  });
}

export async function deleteAutosave(
  db: Db,
  input: AutosavePairInput,
): Promise<boolean> {
  const result = await db
    .delete(entries)
    .where(
      and(
        eq(entries.type, AUTOSAVE_TYPE),
        eq(entries.slug, buildAutosaveSlug(input)),
      ),
    )
    .returning({ id: entries.id });
  return result.length > 0;
}

interface ListActiveAutosavesInput {
  readonly entryId: number;
  /** A parameter so tests can pin it to a fixture time. */
  readonly notOlderThan: Date;
  // Exclude the calling user — every viewer should see their
  // co-authors, not themselves.
  readonly excludeAuthorId: number;
}

// Slug shape is `autosave:<entryId>:<authorId>`; the leading-anchor
// `LIKE` scopes the query to one entry without a JOIN. Same pattern
// as `listRevisions`.
function entryAutosavePrefix(entryId: number): string {
  return `autosave:${String(entryId)}:%`;
}

/**
 * Raw rows, so the RPC layer's user-join policy can change without touching
 * the repository.
 */
export async function listActiveAutosaves(
  db: Db,
  input: ListActiveAutosavesInput,
): Promise<readonly Entry[]> {
  return db.query.entries.findMany({
    where: and(
      eq(entries.type, AUTOSAVE_TYPE),
      like(entries.slug, entryAutosavePrefix(input.entryId)),
      gte(entries.updatedAt, input.notOlderThan),
      ne(entries.authorId, input.excludeAuthorId),
    ),
    orderBy: [desc(entries.updatedAt)],
  });
}

interface SetRevisionMessageInput {
  readonly revisionId: number;
  // `null` clears the message (deletes the meta key). The RPC layer
  // is responsible for normalizing empty strings to null before it
  // gets here — the repository writes what it's told.
  readonly message: string | null;
}

// Patches the revision row's `meta.__plumix_revision_message`. Returns
// the updated row, or `undefined` if `revisionId` doesn't exist.
export async function setRevisionMessage(
  db: Db,
  input: SetRevisionMessageInput,
): Promise<Entry | undefined> {
  const current = await getRevision(db, { revisionId: input.revisionId });
  if (!current) return undefined;
  const nextMeta = { ...current.meta };
  if (input.message === null) {
    delete nextMeta[REVISION_MESSAGE_META_KEY];
  } else {
    nextMeta[REVISION_MESSAGE_META_KEY] = input.message;
  }
  const [row] = await db
    .update(entries)
    .set({ meta: nextMeta })
    .where(eq(entries.id, input.revisionId))
    .returning();
  return row;
}

interface PruneInput {
  readonly entryId: number;
  readonly maxRevisions: number;
}

// Deletes the oldest revisions for `entryId` past `maxRevisions`.
// Returns the count actually pruned (0 when under the cap).
export async function pruneOldRevisions(
  db: Db,
  input: PruneInput,
): Promise<number> {
  const revisions = await db.query.entries.findMany({
    where: and(
      eq(entries.type, REVISION_TYPE),
      like(entries.slug, entryRevisionPrefix(input.entryId)),
    ),
    orderBy: [desc(entries.id)],
    columns: { id: true },
  });
  const excess = revisions.slice(input.maxRevisions);
  if (excess.length === 0) return 0;
  await db.delete(entries).where(
    inArray(
      entries.id,
      excess.map((r) => r.id),
    ),
  );
  return excess.length;
}

/**
 * History links to its entry only through the encoded slug, not an FK, so
 * deleting entries leaves it behind unless this runs first.
 */
export async function deleteEntriesHistory(
  db: Db,
  entryIds: readonly number[],
): Promise<void> {
  if (entryIds.length === 0) return;
  await db
    .delete(entries)
    .where(
      or(
        ...entryIds.flatMap((entryId) => [
          and(
            eq(entries.type, REVISION_TYPE),
            like(entries.slug, entryRevisionPrefix(entryId)),
          ),
          and(
            eq(entries.type, AUTOSAVE_TYPE),
            like(entries.slug, entryAutosavePrefix(entryId)),
          ),
        ]),
      ),
    );
}
