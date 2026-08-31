import type { BlockRegistry, BlockTextRoster } from "plumix/blocks";
import type { AppContext } from "plumix/plugin";
import { blockTextRoster, blockTextVersion } from "plumix/blocks";
import { and, eq, inArray, sql } from "plumix/db";
import { entries } from "plumix/schema";

import type { NewSearchDocument } from "../db/schema.js";
import { searchDocuments } from "../db/schema.js";
import { entryDocumentBody, isSearchableEntryType } from "./document.js";

// D1 caps bound parameters at 100 per statement, and libsql — every test here
// — enforces no cap at all, so the ceiling is invisible until production. Kept
// below it rather than on it: a chunk of ids binds one per id plus the
// `source_type` the delete adds (91), and a document binds its five columns
// (90). A sixth column or a second predicate then has room to be wrong.
const IDS_PER_STATEMENT = 90;
const DOCUMENTS_PER_STATEMENT = 18;

interface Extractor {
  readonly roster: BlockTextRoster;
  readonly version: string;
}

// Merging the roster and hashing it walks every registered block, so it is
// done once per registry rather than once per entry. Keyed on the registry,
// which is built at boot and never mutated, and collected with the app.
const extractors = new WeakMap<BlockRegistry, Extractor>();

function extractorFor(blocks: BlockRegistry): Extractor {
  const cached = extractors.get(blocks);
  if (cached !== undefined) return cached;
  const roster = blockTextRoster(blocks);
  const extractor: Extractor = { roster, version: blockTextVersion(roster) };
  extractors.set(blocks, extractor);
  return extractor;
}

/**
 * Bring the projection — and through its triggers, the index — up to date
 * with what the database currently says about these entries.
 *
 * Reads the entries rather than taking them from a caller, so the two paths
 * that call this need not agree on anything but a list of ids: a lifecycle
 * action knows an entry changed, a drained feed row knows only its id, and
 * a tombstone's entry is already gone. An id whose row has vanished, and an
 * id whose type is not searchable, are the same instruction — drop whatever
 * the projection holds for it — which is what makes excluding an entry type
 * take effect on the next write rather than needing a sweep of its own.
 */
export async function indexEntries(
  ctx: AppContext,
  entryIds: Iterable<number>,
): Promise<void> {
  const ids = [...new Set(entryIds)];
  const extractor = extractorFor(ctx.blocks);

  for (let i = 0; i < ids.length; i += IDS_PER_STATEMENT) {
    const chunk = ids.slice(i, i + IDS_PER_STATEMENT);
    const rows = await ctx.db
      .select({
        id: entries.id,
        type: entries.type,
        title: entries.title,
        excerpt: entries.excerpt,
        content: entries.content,
      })
      .from(entries)
      .where(inArray(entries.id, chunk));

    const documents: NewSearchDocument[] = [];
    const removed = new Set(chunk);
    for (const row of rows) {
      if (!isSearchableEntryType(ctx.plugins, row.type)) continue;
      removed.delete(row.id);
      documents.push({
        sourceType: "entry",
        sourceId: row.id,
        title: row.title,
        body: entryDocumentBody(row, extractor.roster),
        extractorVersion: extractor.version,
      });
    }

    await writeDocuments(ctx, documents);
    await dropEntryDocuments(ctx, [...removed]);
  }
}

/**
 * `DO UPDATE … WHERE` rather than an unconditional one: a save that left the
 * text where it was leaves the row untouched, no `AFTER UPDATE` fires, and
 * the document is not tokenized again. That is what keeps a bulk status
 * change, or a save that only moved metadata, off the index's write path.
 *
 * `IS NOT` rather than `<>`, so clearing an excerpt — or writing one for the
 * first time — reads as the change it is instead of as SQL's null.
 */
async function writeDocuments(
  ctx: AppContext,
  documents: readonly NewSearchDocument[],
): Promise<void> {
  for (let i = 0; i < documents.length; i += DOCUMENTS_PER_STATEMENT) {
    await ctx.db
      .insert(searchDocuments)
      .values(documents.slice(i, i + DOCUMENTS_PER_STATEMENT))
      .onConflictDoUpdate({
        target: [searchDocuments.sourceType, searchDocuments.sourceId],
        set: {
          title: sql`excluded.title`,
          body: sql`excluded.body`,
          extractorVersion: sql`excluded.extractor_version`,
        },
        setWhere: sql`
          ${searchDocuments.title} IS NOT excluded.title
          OR ${searchDocuments.body} IS NOT excluded.body
          OR ${searchDocuments.extractorVersion} IS NOT excluded.extractor_version
        `,
      });
  }
}

async function dropEntryDocuments(
  ctx: AppContext,
  entryIds: readonly number[],
): Promise<void> {
  if (entryIds.length === 0) return;
  await ctx.db
    .delete(searchDocuments)
    .where(
      and(
        eq(searchDocuments.sourceType, "entry"),
        inArray(searchDocuments.sourceId, entryIds),
      ),
    );
}
