import type { BlockRegistry, BlockTextRoster } from "plumix/blocks";
import type { AppContext } from "plumix/plugin";
import { blockTextRoster, blockTextVersion } from "plumix/blocks";
import { and, eq, inArray, ne, sql } from "plumix/db";
import { entries, terms } from "plumix/schema";

import type { NewSearchDocument, SearchSourceType } from "../db/schema.js";
import type { SearchableMetaRoster } from "./meta-text.js";
import { searchDocuments } from "../db/schema.js";
import {
  entryDocumentBody,
  indexableEntryTypes,
  isIndexableEntryType,
  isSearchableTaxonomy,
} from "./document.js";
import { metaTextVersion, searchableMetaRoster } from "./meta-text.js";

// D1 caps bound parameters at 100 per statement, and libsql — every test here
// — enforces no cap at all, so the ceiling is invisible until production. Kept
// below it rather than on it: a chunk of ids binds one per id plus the
// `source_type` the delete adds (91), and a document binds its five columns
// (90). A sixth column or a second predicate then has room to be wrong.
const IDS_PER_STATEMENT = 90;

// A term has no blocks and no searchable meta, so neither roster says anything
// about how its text was projected. Stamping their hash on it would mark every
// term stale whenever any block or field changed a declaration a term cannot
// be affected by.
const TERM_EXTRACTOR_VERSION = "term/1";
const DOCUMENTS_PER_STATEMENT = 18;

interface BlockExtractor {
  readonly roster: BlockTextRoster;
  readonly version: string;
}

interface Extractor {
  readonly blocks: BlockTextRoster;
  readonly meta: SearchableMetaRoster;
  readonly version: string;
}

// Merging the roster and hashing it walks every registered block, so it is
// done once per registry rather than once per entry. Keyed on the registry,
// which is built at boot and never mutated, and collected with the app.
const blockExtractors = new WeakMap<BlockRegistry, BlockExtractor>();

function blockExtractorFor(blocks: BlockRegistry): BlockExtractor {
  const cached = blockExtractors.get(blocks);
  if (cached !== undefined) return cached;
  const roster = blockTextRoster(blocks);
  const extractor: BlockExtractor = {
    roster,
    version: blockTextVersion(roster),
  };
  blockExtractors.set(blocks, extractor);
  return extractor;
}

/**
 * Everything an entry's document is derived from, and one tag naming the pair.
 *
 * The meta half is read fresh rather than cached beside the block half: it
 * walks the registered meta boxes, which is a much smaller thing than every
 * block's slot tree, and a mutable registry — which is what a test has — would
 * otherwise answer with a roster it no longer holds.
 */
function extractorFor(ctx: AppContext): Extractor {
  const { roster, version } = blockExtractorFor(ctx.blocks);
  const meta = searchableMetaRoster(
    ctx.plugins,
    indexableEntryTypes(ctx.plugins),
  );
  return {
    blocks: roster,
    meta,
    // Composite, so either half moving marks the documents both produced
    // stale. Legible on sight, which a combined hash would not be.
    version: `${version}.${metaTextVersion(meta)}`,
  };
}

/** The tag the current rosters produce — what a stale document lacks. */
export function currentExtractorVersion(ctx: AppContext): string {
  return extractorFor(ctx).version;
}

/**
 * Bring the projection — and through its triggers, the index — up to date
 * with what the database currently says about these entries.
 *
 * Reads the entries rather than taking them from a caller, so the two paths
 * that call this need not agree on anything but a list of ids: a lifecycle
 * action knows an entry changed, a drained feed row knows only its id, and
 * a tombstone's entry is already gone. An id whose row has vanished, and an
 * id whose type is no longer indexable, are the same instruction — drop
 * whatever the projection holds for it — which is what makes gating an entry
 * type take effect on the next write rather than needing a sweep of its own.
 */
export async function indexEntries(
  ctx: AppContext,
  entryIds: Iterable<number>,
): Promise<void> {
  const extractor = extractorFor(ctx);
  await project(ctx, "entry", entryIds, async (chunk) => {
    const rows = await ctx.db
      .select({
        id: entries.id,
        type: entries.type,
        title: entries.title,
        excerpt: entries.excerpt,
        content: entries.content,
        meta: entries.meta,
      })
      .from(entries)
      .where(inArray(entries.id, chunk));
    return rows
      .filter((row) => isIndexableEntryType(ctx.plugins, row.type))
      .map((row) => ({
        sourceType: "entry" as const,
        sourceId: row.id,
        title: row.title,
        body: entryDocumentBody(
          row,
          extractor.blocks,
          extractor.meta.get(row.type) ?? [],
        ),
        extractorVersion: extractor.version,
      }));
  });
}

/**
 * Bring the projection up to date with what the database says about these
 * terms. A term carries far less than an entry: its name, and the description
 * its archive shows.
 */
export async function indexTerms(
  ctx: AppContext,
  termIds: Iterable<number>,
): Promise<void> {
  await project(ctx, "term", termIds, async (chunk) => {
    const rows = await ctx.db
      .select({
        id: terms.id,
        taxonomy: terms.taxonomy,
        name: terms.name,
        description: terms.description,
      })
      .from(terms)
      .where(inArray(terms.id, chunk));
    return rows
      .filter((row) => isSearchableTaxonomy(ctx.plugins, row.taxonomy))
      .map((row) => ({
        sourceType: "term" as const,
        sourceId: row.id,
        title: row.name,
        body: row.description ?? "",
        extractorVersion: TERM_EXTRACTOR_VERSION,
      }));
  });
}

/**
 * Walk the ids in statement-sized chunks, write what `documentsFor` produced,
 * and drop whatever it did not.
 *
 * The reconciliation is the load-bearing half, and it is shared rather than
 * written per kind so the two cannot drift: an id the read did not return —
 * because the row is gone, or because its type or taxonomy no longer belongs
 * in the projection — is the same instruction either way, drop what the
 * projection holds for it. That is what makes gating a type take effect on
 * the next write rather than needing a sweep of its own.
 */
async function project(
  ctx: AppContext,
  sourceType: SearchSourceType,
  sourceIds: Iterable<number>,
  documentsFor: (chunk: readonly number[]) => Promise<NewSearchDocument[]>,
): Promise<void> {
  const ids = [...new Set(sourceIds)];
  for (let i = 0; i < ids.length; i += IDS_PER_STATEMENT) {
    const chunk = ids.slice(i, i + IDS_PER_STATEMENT);
    const documents = await documentsFor(chunk);
    await writeDocuments(ctx, documents);
    await stampVersion(ctx, sourceType, documents);
    const kept = new Set(documents.map((document) => document.sourceId));
    await dropDocuments(
      ctx,
      sourceType,
      chunk.filter((id) => !kept.has(id)),
    );
  }
}

/**
 * `DO UPDATE … WHERE` rather than an unconditional one: a save that left the
 * text where it was leaves the row untouched, no `AFTER UPDATE` fires, and
 * the document is not tokenized again. That is what keeps a bulk status
 * change, or a save that only moved meta nothing indexes, off the index's
 * write path.
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
        // Text only. A document whose extractor version moved but whose text
        // did not is stamped below instead, which the column-scoped update
        // trigger ignores — so a block changing its declaration re-tokenizes
        // the entries it actually changed rather than the whole corpus.
        setWhere: sql`
          ${searchDocuments.title} IS NOT excluded.title
          OR ${searchDocuments.body} IS NOT excluded.body
        `,
      });
  }
}

/**
 * Bring every document in this batch up to the version that produced it.
 *
 * A separate statement because it must not look like a change to the text:
 * the update trigger is scoped to `title` and `body`, so this moves a stale
 * document off the repair list without re-tokenizing it. Rows the upsert
 * above already rewrote are matched too and cost nothing — they carry the
 * version by then, and SQLite skips a write that changes nothing.
 */
async function stampVersion(
  ctx: AppContext,
  sourceType: SearchSourceType,
  documents: readonly NewSearchDocument[],
): Promise<void> {
  const [version] = new Set(documents.map((doc) => doc.extractorVersion));
  if (version === undefined) return;
  for (let i = 0; i < documents.length; i += IDS_PER_STATEMENT) {
    await ctx.db
      .update(searchDocuments)
      .set({ extractorVersion: version })
      .where(
        and(
          eq(searchDocuments.sourceType, sourceType),
          inArray(
            searchDocuments.sourceId,
            documents
              .slice(i, i + IDS_PER_STATEMENT)
              .map((doc) => doc.sourceId),
          ),
          ne(searchDocuments.extractorVersion, version),
        ),
      );
  }
}

async function dropDocuments(
  ctx: AppContext,
  sourceType: SearchSourceType,
  sourceIds: readonly number[],
): Promise<void> {
  if (sourceIds.length === 0) return;
  await ctx.db
    .delete(searchDocuments)
    .where(
      and(
        eq(searchDocuments.sourceType, sourceType),
        inArray(searchDocuments.sourceId, sourceIds),
      ),
    );
}
