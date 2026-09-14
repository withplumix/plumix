import { sql } from "drizzle-orm";

import type { AppContext } from "../context/app.js";
import type {
  RegisteredEntryType,
  RegisteredTermTaxonomy,
} from "../plugin/manifest.js";
import { withBasePath } from "../base-path.js";
import { chunkForD1, D1_MAX_BOUND_PARAMETERS, inArray } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { terms } from "../db/schema/terms.js";

type PermalinkContext = Pick<AppContext, "db" | "plugins" | "basePath">;

interface EntryPermalinkSource {
  readonly type: string;
  readonly slug: string;
  readonly parentId?: number | null;
}

interface TermArchiveSource {
  readonly taxonomy: string;
  readonly slug: string;
  readonly parentId?: number | null;
}

/**
 * Reverse of `compileRouteMap` — given an entry, produce its public URL.
 * Symmetric to `match.ts` (URL → entity); used by sitemap, RSS, canonical
 * tags, the menu plugin's resolver, and any reference-field "go to source"
 * link.
 *
 * Non-hierarchical types: pure substitution into the registered rewrite
 * pattern, no DB hit. Hierarchical types: one recursive CTE walks the
 * `parent_id` chain and prepends each ancestor's slug. Pass
 * `ancestorSlugs` to skip the CTE when the caller already has the chain
 * loaded (e.g. a breadcrumb renderer that just walked it).
 *
 * Returns `null` when the entry type is `isPublic: false` (no public
 * surface exists) or when the type isn't registered.
 */
export async function buildEntryPermalink(
  ctx: PermalinkContext,
  entry: EntryPermalinkSource,
  options?: { readonly ancestorSlugs?: readonly string[] },
): Promise<string | null> {
  const nested = nestedEntry(ctx, entry);
  if (nested === null) return buildEntryPermalinkSync(ctx, entry);
  const ancestors =
    options?.ancestorSlugs ?? (await loadAncestorSlugs(ctx, nested.parentId));
  return nestedEntryPermalink(ctx, nested.entryType, ancestors, entry.slug);
}

/**
 * `buildEntryPermalink` over a list, with every nested row's ancestor chain
 * read in one recursive query rather than one per row. URLs line up with
 * `rows` by index.
 */
export async function buildEntryPermalinks(
  ctx: PermalinkContext,
  rows: readonly EntryPermalinkSource[],
): Promise<(string | null)[]> {
  const plans = rows.map((row) => ({ row, nested: nestedEntry(ctx, row) }));
  const chains = await loadAncestorChains(
    ctx,
    entries,
    plans.flatMap(({ nested }) => (nested === null ? [] : [nested.parentId])),
  );
  return plans.map(({ row, nested }) =>
    nested === null
      ? buildEntryPermalinkSync(ctx, row)
      : nestedEntryPermalink(
          ctx,
          nested.entryType,
          chains.get(nested.parentId) ?? [],
          row.slug,
        ),
  );
}

/**
 * Reverse routing for taxonomy archives. Same shape as
 * `buildEntryPermalink` — pure substitution for flat taxonomies, single
 * recursive CTE for hierarchical ones.
 */
export async function buildTermArchiveUrl(
  ctx: PermalinkContext,
  term: TermArchiveSource,
  options?: { readonly ancestorSlugs?: readonly string[] },
): Promise<string | null> {
  const nested = nestedTerm(ctx, term);
  if (nested === null) return buildTermArchiveUrlSync(ctx, term);
  const ancestors =
    options?.ancestorSlugs ??
    (await loadTermAncestorSlugs(ctx, nested.parentId));
  return nestedTermArchiveUrl(ctx, nested.taxonomy, ancestors, term.slug);
}

/** `buildTermArchiveUrl` over a list — mirror of `buildEntryPermalinks`. */
export async function buildTermArchiveUrls(
  ctx: PermalinkContext,
  rows: readonly TermArchiveSource[],
): Promise<(string | null)[]> {
  const plans = rows.map((row) => ({ row, nested: nestedTerm(ctx, row) }));
  const chains = await loadAncestorChains(
    ctx,
    terms,
    plans.flatMap(({ nested }) => (nested === null ? [] : [nested.parentId])),
  );
  return plans.map(({ row, nested }) =>
    nested === null
      ? buildTermArchiveUrlSync(ctx, row)
      : nestedTermArchiveUrl(
          ctx,
          nested.taxonomy,
          chains.get(nested.parentId) ?? [],
          row.slug,
        ),
  );
}

/**
 * Sync subset of `buildEntryPermalink`; returns `null` when an ancestor
 * chain lookup is required so callers (e.g., `buildResolvedEntries`)
 * can avoid the per-entry CTE.
 */
export function buildEntryPermalinkSync(
  ctx: Pick<AppContext, "plugins" | "basePath">,
  entry: EntryPermalinkSource,
): string | null {
  const entryType = ctx.plugins.entryTypes.get(entry.type);
  if (!entryType?.isPublic) return null;
  if (shouldNestUnderEntryParent(entryType, entry.parentId ?? null))
    return null;
  return withBasePath(
    joinSegments([entryTypeBaseSlug(entryType), entry.slug]),
    ctx.basePath,
  );
}

/**
 * Sync subset of `buildTermArchiveUrl` — mirror of `buildEntryPermalinkSync`.
 * Returns `null` when a nested term needs an ancestor-chain DB walk, so
 * callers (e.g. `buildResolvedEntries`) attach a `url` without a per-term CTE.
 */
export function buildTermArchiveUrlSync(
  ctx: Pick<AppContext, "plugins" | "basePath">,
  term: {
    readonly taxonomy: string;
    readonly slug: string;
    readonly parentId?: number | null;
  },
): string | null {
  const taxonomy = ctx.plugins.termTaxonomies.get(term.taxonomy);
  if (!taxonomy?.isPublic) return null;
  if (shouldNestUnderTermParent(taxonomy, term.parentId ?? null)) return null;
  return withBasePath(
    joinSegments([termTaxonomyBaseSlug(taxonomy), term.slug]),
    ctx.basePath,
  );
}

function entryTypeBaseSlug(entryType: RegisteredEntryType): string {
  return entryType.rewrite?.slug ?? entryType.name;
}

export function termTaxonomyBaseSlug(taxonomy: RegisteredTermTaxonomy): string {
  return taxonomy.rewrite?.slug ?? taxonomy.name;
}

interface NestedEntry {
  readonly entryType: RegisteredEntryType;
  readonly parentId: number;
}

/** The public type and parent to walk from, or `null` when the URL needs no walk. */
function nestedEntry(
  ctx: Pick<AppContext, "plugins">,
  entry: EntryPermalinkSource,
): NestedEntry | null {
  const entryType = ctx.plugins.entryTypes.get(entry.type);
  if (!entryType?.isPublic) return null;
  const parentId = entry.parentId ?? null;
  if (!shouldNestUnderEntryParent(entryType, parentId)) return null;
  return { entryType, parentId };
}

function nestedEntryPermalink(
  ctx: Pick<AppContext, "basePath">,
  entryType: RegisteredEntryType,
  ancestors: readonly string[],
  slug: string,
): string {
  return withBasePath(
    joinSegments([entryTypeBaseSlug(entryType), ...ancestors, slug]),
    ctx.basePath,
  );
}

interface NestedTerm {
  readonly taxonomy: RegisteredTermTaxonomy;
  readonly parentId: number;
}

function nestedTerm(
  ctx: Pick<AppContext, "plugins">,
  term: TermArchiveSource,
): NestedTerm | null {
  const taxonomy = ctx.plugins.termTaxonomies.get(term.taxonomy);
  if (!taxonomy?.isPublic) return null;
  const parentId = term.parentId ?? null;
  if (!shouldNestUnderTermParent(taxonomy, parentId)) return null;
  return { taxonomy, parentId };
}

function nestedTermArchiveUrl(
  ctx: Pick<AppContext, "basePath">,
  taxonomy: RegisteredTermTaxonomy,
  ancestors: readonly string[],
  slug: string,
): string {
  return withBasePath(
    joinSegments([termTaxonomyBaseSlug(taxonomy), ...ancestors, slug]),
    ctx.basePath,
  );
}

function shouldNestUnderEntryParent(
  entryType: RegisteredEntryType,
  parentId: number | null,
): parentId is number {
  if (parentId === null) return false;
  if (entryType.isHierarchical !== true) return false;
  // `rewrite.isHierarchical: false` opts out of nested URLs even when the
  // type itself is hierarchical (matches WP's `rewrite => ['hierarchical' => false]`).
  return entryType.rewrite?.isHierarchical !== false;
}

function shouldNestUnderTermParent(
  taxonomy: RegisteredTermTaxonomy,
  parentId: number | null,
): parentId is number {
  if (parentId === null) return false;
  if (taxonomy.isHierarchical !== true) return false;
  return taxonomy.rewrite?.isHierarchical !== false;
}

/**
 * Build a URL pathname from segment-shaped inputs. Splits on internal `/`
 * (so a slug stored as `"a/b"` produces two segments rather than embedding
 * the slash literally and shadowing a sibling route), drops empty parts
 * and `.` / `..` traversal markers.
 */
function joinSegments(
  segments: readonly (string | null | undefined)[],
): string {
  const parts: string[] = [];
  for (const segment of segments) {
    if (typeof segment !== "string" || segment.length === 0) continue;
    for (const part of segment.split("/")) {
      const trimmed = part.trim();
      if (trimmed.length === 0 || trimmed === "." || trimmed === "..") continue;
      parts.push(trimmed);
    }
  }
  return "/" + parts.join("/");
}

interface ChainRow {
  readonly leaf: number;
  readonly slug: string;
}

// `parent_id` is a self-FK with no DB-level cycle prevention. Cap recursion
// depth so a malformed chain (a→b, b→a) returns truncated rather than
// hitting SQLite's default 1000-deep limit and bubbling as a 500. Real
// content trees stay well under 50 levels.
const MAX_ANCESTOR_DEPTH = 50;

/**
 * Exported for the path-chain matcher (`path-chain.ts`) so the inbound
 * `URL → entity` resolver can reuse the same CTE the outbound permalink
 * helper uses. Walks ancestors root-first; one round-trip; depth-capped.
 */
export async function loadAncestorSlugs(
  ctx: Pick<AppContext, "db">,
  leafParentId: number,
): Promise<string[]> {
  const chains = await loadAncestorChains(ctx, entries, [leafParentId]);
  return chains.get(leafParentId) ?? [];
}

export async function loadTermAncestorSlugs(
  ctx: Pick<AppContext, "db">,
  leafParentId: number,
): Promise<string[]> {
  const chains = await loadAncestorChains(ctx, terms, [leafParentId]);
  return chains.get(leafParentId) ?? [];
}

/**
 * Root-first slug chain for each id, keyed by that id, including the id's own
 * slug. One recursive CTE per D1 chunk of distinct ids; an id with no row is
 * absent from the map.
 */
async function loadAncestorChains(
  ctx: Pick<AppContext, "db">,
  table: typeof entries | typeof terms,
  ids: readonly number[],
): Promise<Map<number, string[]>> {
  const chains = new Map<number, string[]>();
  // The depth cap is bound alongside the ids, so each chunk leaves it a slot.
  const chunks = chunkForD1([...new Set(ids)], D1_MAX_BOUND_PARAMETERS - 1);
  for (const chunk of chunks) {
    const rows = await ctx.db.all<ChainRow>(sql`
      WITH RECURSIVE chain(leaf, id, parent_id, slug, depth) AS (
        SELECT id, id, parent_id, slug, 0
        FROM ${table}
        WHERE ${inArray(table.id, chunk)}
        UNION ALL
        SELECT c.leaf, t.id, t.parent_id, t.slug, c.depth + 1
        FROM ${table} t JOIN chain c ON t.id = c.parent_id
        WHERE c.depth < ${MAX_ANCESTOR_DEPTH}
      )
      SELECT leaf, slug FROM chain ORDER BY leaf, depth DESC
    `);
    for (const row of rows) {
      const chain = chains.get(row.leaf) ?? [];
      chain.push(row.slug);
      chains.set(row.leaf, chain);
    }
  }
  return chains;
}
