import { and, desc, eq, inArray, like, lt } from "drizzle-orm";

import type { Db } from "../context/app.js";
import type { Entry, EntryContent } from "../db/schema/entries.js";
import { isUniqueConstraintError } from "../db/errors.js";
import { entries } from "../db/schema/entries.js";
import { RevisionRepositoryError } from "./errors.js";
import {
  AUTOSAVE_TYPE,
  buildAutosaveSlug,
  buildRevisionSlug,
  REVISION_TYPE,
} from "./slug-codec.js";
import {
  encodeSnapshotEnvelope,
  REVISION_MESSAGE_META_KEY,
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

// Stores the live slug + parentId in `meta.__plumix_snapshot` so a
// future "restore" slice can rehydrate without an extra round-trip.
// Retries once ONLY on a unique-index collision (nanoid coincidence);
// any other insert failure bubbles up unchanged so we don't mask
// schema/FK/NOT NULL bugs as "retry candidates".
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

// Slug shape is `revision:<entryId>:<nanoid>`; the `<entryId>:`
// segment + leading-anchor `LIKE` gives a deterministic per-entry
// predicate at the SQL layer. Without this, a JS-level filter after
// a `type='revision'` query would silently lose rows for any entry
// other than the most-recently-written one (limit window saturates
// on noisy neighbours).
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
  // The live entry whose identity (id, slug, parentId) the autosave
  // tracks. The slug + parentId get snapshotted into the autosave's
  // meta envelope so `entry.publish` can restore them onto live
  // without a separate roundtrip.
  readonly entry: Entry;
  // The user editing. Combined with `entry.id` to produce the
  // deterministic slug — UNIQUE (type, slug) enforces "one autosave
  // per (entry, user)" without an extra dedup query.
  readonly authorId: number;
  readonly patch: {
    readonly title: string;
    readonly content: EntryContent | null;
    readonly excerpt: string | null;
    readonly meta: Readonly<Record<string, unknown>>;
  };
}

// Writes the per-user pending edit, inserting on first call and
// upserting on subsequent ones. Returns the post-write row so callers
// can read back `updatedAt` (used as the optimistic-concurrency token
// for the next save). `meta.__plumix_snapshot` stays load-bearing —
// the publish path reads it to recover the live slug + parentId.
export async function upsertAutosave(
  db: Db,
  input: UpsertAutosaveInput,
): Promise<Entry> {
  const { entry, authorId, patch } = input;
  const meta = {
    ...patch.meta,
    ...encodeSnapshotEnvelope({ slug: entry.slug, parentId: entry.parentId }),
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
      // The autosave row's identity (type / slug / authorId) is
      // fixed by the deterministic-slug contract; only the editable
      // fields + the snapshot envelope can change. `excluded.*`
      // references the conflicting insert's values per SQLite's
      // upsert dialect.
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

interface AutosavePairInput {
  readonly entryId: number;
  readonly authorId: number;
}

export async function getAutosave(
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
