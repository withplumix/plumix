import type { ResolvedEntry, TemplateDepLoader } from "plumix";
import type { AppContext } from "plumix/plugin";
import type { Entry } from "plumix/schema";
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { readEntryType, resolveEntryList } from "plumix/plugin";
import { entries, entryTerm } from "plumix/schema";

// Related-by-term only means anything where this plugin's post taxonomies
// exist, so the template dep lives here, not in core.
declare module "plumix" {
  interface TemplateDepRegistry {
    relatedPosts: { slug: string; result: readonly ResolvedEntry[] };
  }
}

export type RelatedPosts = readonly ResolvedEntry[];

// The single-post "related" strip stays short — three cards below the article.
const RELATED_POSTS_LIMIT = 3;

/**
 * Published entries sharing a term with `currentId` and of its type, newest
 * first, excluding itself.
 */
export async function findRelatedEntries(
  ctx: AppContext,
  currentId: number,
  limit: number,
): Promise<readonly Entry[]> {
  const selfType = await readEntryType(ctx, currentId);
  if (selfType === null) return [];

  // Terms and siblings stay subqueries: materialising either as an id list
  // binds one parameter per id, and D1 caps a statement at 100.
  const currentTermIds = ctx.db
    .select({ termId: entryTerm.termId })
    .from(entryTerm)
    .where(eq(entryTerm.entryId, currentId));
  const siblingIds = ctx.db
    .select({ id: entryTerm.entryId })
    .from(entryTerm)
    .where(
      and(
        inArray(entryTerm.termId, currentTermIds),
        ne(entryTerm.entryId, currentId),
      ),
    );

  // The write path doesn't enforce that a term's entry matches the taxonomy's
  // `entryTypes`, so re-filter by type at read time.
  return ctx.db
    .select()
    .from(entries)
    .where(
      and(
        inArray(entries.id, siblingIds),
        eq(entries.type, selfType),
        eq(entries.status, "published"),
        isNotNull(entries.publishedAt),
      ),
    )
    .orderBy(desc(entries.publishedAt), desc(entries.id))
    .limit(limit);
}

/**
 * Resolves only on a single-entry route; elsewhere, or with no shared terms, it
 * yields no slugs.
 */
export function createRelatedPostsLoader(
  limit = RELATED_POSTS_LIMIT,
): TemplateDepLoader<"relatedPosts"> {
  return async ({ slugs }, ctx) => {
    const current = ctx.resolvedEntity;
    if (current?.kind !== "entry") return {};

    const rows = await findRelatedEntries(ctx, current.id, limit);
    if (rows.length === 0) return {};

    const resolved = await resolveEntryList(ctx, rows);
    return Object.fromEntries(slugs.map((slug) => [slug, resolved]));
  };
}
