import type { AppContext } from "../context/app-context.js";
import type { Term } from "../db/schema/terms.js";
import type { User } from "../db/schema/users.js";
import { termPurgeTags, usersPurgeTags } from "../cdn/contract/tags.js";
import { and, eq } from "../db/index.js";
import { terms } from "../db/schema/terms.js";
import { users } from "../db/schema/users.js";
import {
  publicEntryTypeNames,
  termPageEntryTypeNames,
} from "../plugin/registry.js";

/**
 * Ancestor segments of a nested URL are ignored: `(taxonomy, slug)` is unique.
 * Memoized per request, misses included, until a term write announces the
 * taxonomy's tags.
 */
export function findTermBySlug(
  ctx: AppContext,
  taxonomy: string,
  slug: string,
): Promise<Term | null> {
  if (slug === "") return Promise.resolve(null);
  return ctx.memo(
    termKey(taxonomy, slug),
    async () =>
      (await ctx.db.query.terms.findFirst({
        where: and(eq(terms.taxonomy, taxonomy), eq(terms.slug, slug)),
      })) ?? null,
    termAtTags(ctx, taxonomy),
  );
}

/** Remember a term loaded another way as the term at its slug. */
export async function rememberTerm(ctx: AppContext, term: Term): Promise<void> {
  await ctx.memo(
    termKey(term.taxonomy, term.slug),
    () => Promise.resolve(term),
    termAtTags(ctx, term.taxonomy),
  );
}

function termKey(taxonomy: string, slug: string): string {
  return `core:term-at:${JSON.stringify([taxonomy, slug])}`;
}

// A miss has no term id, so it is tagged with what any term write in the
// taxonomy announces; an unrelated write costs one re-read.
function termAtTags(ctx: AppContext, taxonomy: string): readonly string[] {
  return termPurgeTags(termPageEntryTypeNames(ctx.plugins, taxonomy));
}

/**
 * The user an author URL's slug names. Memoized per request for the reason
 * {@link findTermBySlug} is: the author page and its listing's `byAuthor` ask
 * the same question.
 */
export function findAuthorBySlug(
  ctx: AppContext,
  slug: string,
): Promise<User | null> {
  if (slug === "") return Promise.resolve(null);
  return ctx.memo(
    authorKey(slug),
    async () =>
      (await ctx.db.query.users.findFirst({ where: eq(users.slug, slug) })) ??
      null,
    authorAtTags(ctx),
  );
}

/** Remember a user loaded another way as the author at their slug. */
export async function rememberAuthor(
  ctx: AppContext,
  user: User,
): Promise<void> {
  await ctx.memo(
    authorKey(user.slug),
    () => Promise.resolve(user),
    authorAtTags(ctx),
  );
}

function authorKey(slug: string): string {
  return `core:author-at:${slug}`;
}

// Keyed by slug for the reason the term lookup is: a miss has
// no user id, so the entry carries what any user write announces.
function authorAtTags(ctx: AppContext): readonly string[] {
  return usersPurgeTags(publicEntryTypeNames(ctx.plugins));
}
