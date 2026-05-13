import { sql } from "drizzle-orm";

import type { AppContext } from "../context/app.js";
import type {
  RegisteredEntryType,
  RegisteredTermTaxonomy,
} from "../plugin/manifest.js";

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
  ctx: AppContext,
  entry: {
    readonly type: string;
    readonly slug: string;
    readonly parentId?: number | null;
  },
  options?: { readonly ancestorSlugs?: readonly string[] },
): Promise<string | null> {
  const entryType = ctx.plugins.entryTypes.get(entry.type);
  if (!entryType || entryType.isPublic === false) return null;

  const baseSlug = entryTypeBaseSlug(entryType);
  const parentId = entry.parentId ?? null;

  if (!shouldNestUnderEntryParent(entryType, parentId)) {
    return joinSegments([baseSlug, entry.slug]);
  }

  // shouldNestUnderEntryParent guarantees parentId is non-null here.
  const ancestors =
    options?.ancestorSlugs ?? (await loadAncestorSlugs(ctx, parentId));
  return joinSegments([baseSlug, ...ancestors, entry.slug]);
}

/**
 * Reverse routing for taxonomy archives. Same shape as
 * `buildEntryPermalink` — pure substitution for flat taxonomies, single
 * recursive CTE for hierarchical ones.
 */
export async function buildTermArchiveUrl(
  ctx: AppContext,
  term: {
    readonly taxonomy: string;
    readonly slug: string;
    readonly parentId?: number | null;
  },
  options?: { readonly ancestorSlugs?: readonly string[] },
): Promise<string | null> {
  const taxonomy = ctx.plugins.termTaxonomies.get(term.taxonomy);
  if (!taxonomy || taxonomy.isPublic === false) return null;

  const baseSlug = termTaxonomyBaseSlug(taxonomy);
  const parentId = term.parentId ?? null;

  if (!shouldNestUnderTermParent(taxonomy, parentId)) {
    return joinSegments([baseSlug, term.slug]);
  }

  const ancestors =
    options?.ancestorSlugs ?? (await loadTermAncestorSlugs(ctx, parentId));
  return joinSegments([baseSlug, ...ancestors, term.slug]);
}

function entryTypeBaseSlug(entryType: RegisteredEntryType): string {
  return entryType.rewrite?.slug ?? entryType.name;
}

function termTaxonomyBaseSlug(taxonomy: RegisteredTermTaxonomy): string {
  return taxonomy.rewrite?.slug ?? taxonomy.name;
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

interface SlugRow {
  readonly slug: string;
}

// `parent_id` is a self-FK with no DB-level cycle prevention. Cap recursion
// depth so a malformed chain (a→b, b→a) returns truncated rather than
// hitting SQLite's default 1000-deep limit and bubbling as a 500. Real
// content trees stay well under 50 levels.
const MAX_ANCESTOR_DEPTH = 50;

/**
 * One round-trip ancestor lookup via SQLite recursive CTE. Walks the
 * `entries.parent_id` chain starting from `leafParentId`, returning slugs
 * ordered root-first.
 */
/**
 * Exported for the path-chain matcher (`path-chain.ts`) so the inbound
 * `URL → entity` resolver can reuse the same CTE the outbound permalink
 * helper uses. Walks ancestors root-first; one round-trip; depth-capped.
 */
export async function loadAncestorSlugs(
  ctx: AppContext,
  leafParentId: number,
): Promise<string[]> {
  const rows = await ctx.db.all<SlugRow>(sql`
    WITH RECURSIVE chain(id, parent_id, slug, depth) AS (
      SELECT id, parent_id, slug, 0
      FROM entries
      WHERE id = ${leafParentId}
      UNION ALL
      SELECT e.id, e.parent_id, e.slug, c.depth + 1
      FROM entries e JOIN chain c ON e.id = c.parent_id
      WHERE c.depth < ${MAX_ANCESTOR_DEPTH}
    )
    SELECT slug FROM chain ORDER BY depth DESC
  `);
  return rows.map((r) => r.slug);
}

export async function loadTermAncestorSlugs(
  ctx: AppContext,
  leafParentId: number,
): Promise<string[]> {
  const rows = await ctx.db.all<SlugRow>(sql`
    WITH RECURSIVE chain(id, parent_id, slug, depth) AS (
      SELECT id, parent_id, slug, 0
      FROM terms
      WHERE id = ${leafParentId}
      UNION ALL
      SELECT t.id, t.parent_id, t.slug, c.depth + 1
      FROM terms t JOIN chain c ON t.id = c.parent_id
      WHERE c.depth < ${MAX_ANCESTOR_DEPTH}
    )
    SELECT slug FROM chain ORDER BY depth DESC
  `);
  return rows.map((r) => r.slug);
}
