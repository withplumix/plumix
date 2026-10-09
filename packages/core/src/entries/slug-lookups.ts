/**
 * The term and the author an archive URL's slug names, memoized per request.
 * The term and author pages resolve their subject with these, and a listing's
 * `inTerm` and `byAuthor` compile through the same lookups.
 */

import type { AppContext } from "../context/app-context.js";
import type { Term } from "../db/schema/terms.js";
import type { User } from "../db/schema/users.js";
import { and, eq } from "../db/index.js";
import { terms } from "../db/schema/terms.js";
import { users } from "../db/schema/users.js";
import { readTags } from "../plugin/cache-tags.js";
import { publicEntryTypeNames } from "../plugin/registry.js";

/**
 * The term a slug names in a taxonomy. `(taxonomy, slug)` is unique, so the
 * slug alone is the term's address — the ancestor segments of a nested URL
 * identify nothing the slug didn't (ADR 0012).
 *
 * Memoized per request, because a term page asks twice — once to resolve its
 * subject, once when its listing's `inTerm` compiles — and both must be the
 * one lookup. A miss is remembered like a hit, until a term write in the same
 * request announces the taxonomy's tags.
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

// Keyed by slug, so a miss has no term id to carry: the entry reads the whole
// taxonomy, which any write to a term of it reaches. A term created or
// renamed later in the same request (a cron invocation shares one
// memo) is found by the next lookup; so is every unrelated term write, which
// costs one re-read.
function termAtTags(ctx: AppContext, taxonomy: string): readonly string[] {
  return readTags(ctx.plugins, [{ kind: "taxonomy", taxonomy }]);
}

/**
 * The user an author URL's slug names. Memoized per request for the reason
 * {@link findTermBySlug} is: the author page and its listing's `byAuthor` ask the
 * same question.
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
// no user id, so the entry reads every public type, which any user write
// reaches.
function authorAtTags(ctx: AppContext): readonly string[] {
  return readTags(
    ctx.plugins,
    publicEntryTypeNames(ctx.plugins).map((type) => ({
      kind: "entryType",
      type,
    })),
  );
}
