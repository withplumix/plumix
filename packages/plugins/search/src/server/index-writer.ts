import type { BlockRegistry, BlockTextRoster } from "plumix/blocks";
import type { AppContext } from "plumix/plugin";
import { blockTextRoster, blockTextVersion } from "plumix/blocks";
import {
  and,
  chunkForD1,
  D1_MAX_BOUND_PARAMETERS,
  eq,
  inArray,
  ne,
  sql,
} from "plumix/db";
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

/**
 * libsql, which every test uses, enforces no cap. Headroom below D1's limit
 * covers the delete's extra `source_type` bind and a future column.
 */
const IDS_PER_STATEMENT = D1_MAX_BOUND_PARAMETERS - 10;

/**
 * Not the roster hash: terms have no blocks or meta, and that hash would mark
 * every term stale on any declaration change.
 */
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

/** Keyed on the registry, which is built at boot and never mutated. */
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
 * Meta is read fresh, not cached: it is cheap, and a test's mutable registry
 * would otherwise get a stale roster.
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
 * Drops the document of an id whose row is gone or whose type is no longer
 * indexable.
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
 * Shared so entries and terms cannot drift: an id `documentsFor` did not
 * return is dropped, so gating a type takes effect on the next write.
 */
async function project(
  ctx: AppContext,
  sourceType: SearchSourceType,
  sourceIds: Iterable<number>,
  documentsFor: (chunk: readonly number[]) => Promise<NewSearchDocument[]>,
): Promise<void> {
  const ids = [...new Set(sourceIds)];
  for (const chunk of chunkForD1(ids, IDS_PER_STATEMENT)) {
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
 * Conditional so unchanged text fires no `AFTER UPDATE` and is not
 * re-tokenized. `IS NOT` rather than `<>` so a null-to-text change counts.
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
        // Text only; a version-only change is stamped separately, which the
        // column-scoped trigger ignores.
        setWhere: sql`
          ${searchDocuments.title} IS NOT excluded.title
          OR ${searchDocuments.body} IS NOT excluded.body
        `,
      });
  }
}

/**
 * Separate from the upsert so the `title`/`body`-scoped trigger does not
 * re-tokenize a document whose text did not change.
 */
async function stampVersion(
  ctx: AppContext,
  sourceType: SearchSourceType,
  documents: readonly NewSearchDocument[],
): Promise<void> {
  const [version] = new Set(documents.map((doc) => doc.extractorVersion));
  if (version === undefined) return;
  for (const chunk of chunkForD1(documents, IDS_PER_STATEMENT)) {
    await ctx.db
      .update(searchDocuments)
      .set({ extractorVersion: version })
      .where(
        and(
          eq(searchDocuments.sourceType, sourceType),
          inArray(
            searchDocuments.sourceId,
            chunk.map((doc) => doc.sourceId),
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
