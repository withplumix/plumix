import type { SQL } from "../../../db/index.js";
import type { Post, PostStatus } from "../../../db/schema/posts.js";
import type { SearchTerm } from "./search-terms.js";
import { and, desc, eq, inArray, isNull, not, sql } from "../../../db/index.js";
import { postTerm } from "../../../db/schema/post_term.js";
import { posts } from "../../../db/schema/posts.js";
import { terms } from "../../../db/schema/terms.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { postCapability } from "./lifecycle.js";
import { postListInputSchema } from "./schemas.js";
import { escapeLikePattern, tokenizeSearchQuery } from "./search-terms.js";

const PUBLIC_STATUS: PostStatus = "published";

export const list = base
  .use(authenticated)
  .input(postListInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:post.list:input",
      input,
    );

    const type = filtered.type ?? "post";
    const readCapability = postCapability(type, "read");
    if (!context.auth.can(readCapability)) {
      throw errors.FORBIDDEN({ data: { capability: readCapability } });
    }

    const canSeeAnyStatus = context.auth.can(postCapability(type, "edit_any"));
    const effectiveStatus = canSeeAnyStatus
      ? filtered.status
      : (filtered.status ?? PUBLIC_STATUS);

    if (!canSeeAnyStatus && effectiveStatus !== PUBLIC_STATUS) {
      return context.hooks.applyFilter(
        "rpc:post.list:output",
        [] as readonly Post[],
      );
    }

    const conditions: SQL[] = [eq(posts.type, type)];
    if (effectiveStatus) conditions.push(eq(posts.status, effectiveStatus));
    if (filtered.parentId === null) {
      conditions.push(isNull(posts.parentId));
    } else if (filtered.parentId !== undefined) {
      conditions.push(eq(posts.parentId, filtered.parentId));
    }
    if (filtered.search) {
      for (const term of tokenizeSearchQuery(filtered.search)) {
        conditions.push(searchTermCondition(term));
      }
    }
    if (filtered.taxonomies) {
      for (const [taxonomy, slugs] of Object.entries(filtered.taxonomies)) {
        if (slugs.length === 0) continue;
        // Correlated subquery: post.id must appear in `post_term` joined
        // to `terms` filtered by this taxonomy + listed slugs. One clause
        // per taxonomy; multiple clauses AND together — matching WP's
        // default `tax_query` relation.
        const matching = context.db
          .select({ postId: postTerm.postId })
          .from(postTerm)
          .innerJoin(terms, eq(terms.id, postTerm.termId))
          .where(
            and(eq(terms.taxonomy, taxonomy), inArray(terms.slug, [...slugs])),
          );
        conditions.push(inArray(posts.id, matching));
      }
    }

    const rows = await context.db
      .select()
      .from(posts)
      .where(and(...conditions))
      .orderBy(desc(posts.updatedAt), desc(posts.id))
      .limit(filtered.limit)
      .offset(filtered.offset);

    return context.hooks.applyFilter(
      "rpc:post.list:output",
      rows as readonly Post[],
    );
  });

// One search term → `(title LIKE ? OR content LIKE ? OR excerpt LIKE ?)`
// against an explicit ESCAPE char so literal `%` / `_` in user input don't
// match-all. Excluded (`-term`) wraps the OR in `NOT (…)`.
//
// `content` and `excerpt` are nullable; `LIKE` on NULL yields NULL, which
// is falsy for inclusion matches but becomes `NOT NULL` → still NULL → a
// false-negative for exclusion. COALESCE to empty string so null columns
// behave as empty text across both positive and negative clauses.
function searchTermCondition(term: SearchTerm): SQL {
  const pattern = `%${escapeLikePattern(term.value)}%`;
  // Build the column OR via the raw `sql` tag — `or(...)` returns
  // `SQL | undefined`, which fights both lint rules on non-null assertion
  // style. The sql-tag form has the same parameterization guarantees.
  const match = sql`(
    COALESCE(${posts.title}, '') LIKE ${pattern} ESCAPE '\\'
    OR COALESCE(${posts.content}, '') LIKE ${pattern} ESCAPE '\\'
    OR COALESCE(${posts.excerpt}, '') LIKE ${pattern} ESCAPE '\\'
  )`;
  return term.exclude ? not(match) : match;
}
