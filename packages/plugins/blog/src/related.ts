import type { ResolvedEntry } from "plumix";
import type { AppContext } from "plumix/plugin";
import type { Entry } from "plumix/schema";
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { buildResolvedEntries, readEntryType } from "plumix";
import { entries, entryTerm } from "plumix/schema";

// Augment the template-dep registry so a theme can declare
// `defineTemplate({ relatedPosts: ["related"], render })` and receive the
// resolved siblings. Related-by-term is a blog concern — it only means
// anything where the post taxonomy (category/tag) this plugin registers
// exists — so the dep lives here, not in core. Themes import `RelatedPosts`
// to pull this augmentation, mirroring the comments plugin's `ResolvedThread`.
declare module "plumix/plugin" {
  interface TemplateDepRegistry {
    relatedPosts: { slug: string; result: readonly ResolvedEntry[] };
  }
}

export type RelatedPosts = readonly ResolvedEntry[];

// The single-post "related" strip stays short — three cards below the article.
const RELATED_POSTS_LIMIT = 3;

/**
 * Published entries sharing at least one term (category/tag) with the entry
 * `currentId`, newest first, the current entry excluded. Mirrors WordPress's
 * `get_posts(['category__in' => …, 'post__not_in' => [$id]])` related recipe
 * (the Jetpack/YARPP approach) — not the default theme's plain "more posts",
 * which is just recent.
 */
export async function findRelatedEntries(
  ctx: AppContext,
  currentId: number,
): Promise<readonly Entry[]> {
  const [selfType, termRows] = await Promise.all([
    readEntryType(ctx, currentId),
    ctx.db
      .select({ termId: entryTerm.termId })
      .from(entryTerm)
      .where(eq(entryTerm.entryId, currentId)),
  ]);
  if (selfType === null) return [];
  const termIds = termRows.map((r) => r.termId);
  if (termIds.length === 0) return [];

  const siblingRows = await ctx.db
    .selectDistinct({ id: entryTerm.entryId })
    .from(entryTerm)
    .where(
      and(inArray(entryTerm.termId, termIds), ne(entryTerm.entryId, currentId)),
    );
  const siblingIds = siblingRows.map((r) => r.id);
  if (siblingIds.length === 0) return [];

  // Scope to the current entry's type. The write path doesn't enforce that a
  // term's entry matches the taxonomy's `entryTypes`, so — like core's
  // `resolveTaxonomy` — re-filter at read time rather than trust `entry_term`.
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
    .limit(RELATED_POSTS_LIMIT);
}

/**
 * `relatedPosts` template-dep loader. Only resolves on a single-entry route
 * (reads `ctx.resolvedEntity`); a non-entry route or a post with no shared
 * matches yields no slugs, so the theme's strip stays hidden.
 */
export async function relatedPostsLoader(
  slugs: readonly string[],
  ctx: AppContext,
): Promise<Record<string, RelatedPosts>> {
  const current = ctx.resolvedEntity;
  if (current?.kind !== "entry") return {};

  const rows = await findRelatedEntries(ctx, current.id);
  if (rows.length === 0) return {};

  const resolved = await buildResolvedEntries(ctx, rows);
  return Object.fromEntries(slugs.map((slug) => [slug, resolved]));
}
