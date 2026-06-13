import type { AppContext } from "../context/app.js";
import type { Entry } from "../db/schema/entries.js";
import type { Term } from "../db/schema/terms.js";
import type { PublicAuthor, PublicEntry, PublicTerm } from "./schemas.js";
import { eq, inArray } from "../db/index.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { terms } from "../db/schema/terms.js";
import { users } from "../db/schema/users.js";

export function projectTerm(
  term: Pick<Term, "id" | "name" | "slug">,
): PublicTerm {
  return { id: term.id, name: term.name, slug: term.slug };
}

/**
 * Explicit allowlist — default-deny. Privileged columns (authorId, sortOrder,
 * parentId, meta) and the author's email/role never appear because they are
 * not copied here; adding a column to the entries table does not leak it. The
 * shape is pinned to `publicEntrySchema`, the surface's documented contract.
 */
export function projectEntry(
  entry: Entry,
  author: PublicAuthor | null,
  termsByTaxonomy: Record<string, PublicTerm[]>,
): PublicEntry {
  return {
    id: entry.id,
    type: entry.type,
    slug: entry.slug,
    title: entry.title,
    excerpt: entry.excerpt,
    content: entry.content,
    status: entry.status,
    publishedAt: entry.publishedAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    author,
    terms: termsByTaxonomy,
  };
}

// Batched author lookup — one `WHERE id IN (...)` for the whole page, never a
// per-row query.
export async function loadPublicAuthors(
  ctx: AppContext,
  authorIds: readonly number[],
): Promise<Map<number, PublicAuthor>> {
  const ids = [...new Set(authorIds)];
  if (ids.length === 0) return new Map();
  const rows = await ctx.db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Batched term embed for a page of entries — one join over `entry_term`, never
 * a per-entry query. Terms in non-public taxonomies are dropped (default-deny);
 * within a taxonomy they keep their `entry_term.sortOrder`.
 */
export async function loadEntriesTerms(
  ctx: AppContext,
  entryIds: readonly number[],
): Promise<Map<number, Record<string, PublicTerm[]>>> {
  const result = new Map<number, Record<string, PublicTerm[]>>();
  if (entryIds.length === 0) return result;

  const rows = await ctx.db
    .select({
      entryId: entryTerm.entryId,
      id: terms.id,
      name: terms.name,
      slug: terms.slug,
      taxonomy: terms.taxonomy,
      sortOrder: entryTerm.sortOrder,
    })
    .from(entryTerm)
    .innerJoin(terms, eq(entryTerm.termId, terms.id))
    .where(inArray(entryTerm.entryId, [...new Set(entryIds)]))
    // `id` tiebreaks the default-0 sortOrder so embed order is deterministic.
    .orderBy(entryTerm.sortOrder, terms.id);

  for (const row of rows) {
    if (ctx.plugins.termTaxonomies.get(row.taxonomy)?.isPublic === false) {
      continue;
    }
    const grouped = result.get(row.entryId) ?? {};
    (grouped[row.taxonomy] ??= []).push(projectTerm(row));
    result.set(row.entryId, grouped);
  }
  return result;
}
