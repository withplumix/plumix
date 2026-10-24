import type { AppContext } from "../context/app-context.js";
import type { Term } from "../db/schema/terms.js";
import type { User } from "../db/schema/users.js";
import { declarePageTags } from "../cdn/contract/page-tags.js";
import {
  termSlugsTag,
  termTag,
  userSlugsTag,
  userTag,
} from "../cdn/contract/tags.js";
import { and, eq } from "../db/index.js";
import { terms } from "../db/schema/terms.js";
import { users } from "../db/schema/users.js";

/**
 * Ancestor segments of a nested URL are ignored: `(taxonomy, slug)` is unique.
 * Memoized, misses included. A hit tags the page with the term, so a re-slug
 * purges it.
 */
export async function findTermBySlug(
  ctx: AppContext,
  taxonomy: string,
  slug: string,
): Promise<Term | null> {
  if (slug === "") return null;
  const term = await ctx.memo(
    termKey(taxonomy, slug),
    async () =>
      (await ctx.db.query.terms.findFirst({
        where: and(eq(terms.taxonomy, taxonomy), eq(terms.slug, slug)),
      })) ?? null,
    [termSlugsTag()],
  );
  if (term !== null) declarePageTags(ctx, [termTag(term.id)]);
  return term;
}

/** Remember a term loaded another way as the term at its slug. */
export async function rememberTerm(ctx: AppContext, term: Term): Promise<void> {
  await ctx.memo(
    termKey(term.taxonomy, term.slug),
    () => Promise.resolve(term),
    [termSlugsTag()],
  );
}

function termKey(taxonomy: string, slug: string): string {
  return `core:term-at:${JSON.stringify([taxonomy, slug])}`;
}

/**
 * Memoized per request: the author page and its listing's `byAuthor` ask the
 * same question. A hit tags the page with the user, so a re-slug purges the
 * old slug's page.
 */
export async function findAuthorBySlug(
  ctx: AppContext,
  slug: string,
): Promise<User | null> {
  if (slug === "") return null;
  const user = await ctx.memo(
    authorKey(slug),
    async () =>
      (await ctx.db.query.users.findFirst({ where: eq(users.slug, slug) })) ??
      null,
    [userSlugsTag()],
  );
  if (user !== null) declarePageTags(ctx, [userTag(user.id)]);
  return user;
}

/** Remember a user loaded another way as the author at their slug. */
export async function rememberAuthor(
  ctx: AppContext,
  user: User,
): Promise<void> {
  await ctx.memo(authorKey(user.slug), () => Promise.resolve(user), [
    userSlugsTag(),
  ]);
}

function authorKey(slug: string): string {
  return `core:author-at:${slug}`;
}
