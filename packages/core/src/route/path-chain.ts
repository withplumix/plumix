/**
 * Inbound counterpart to `permalink.ts` — given the segments captured
 * by a `:path+` URLPattern match, find the leaf entity (entry or term)
 * whose parent chain exactly matches the URL.
 *
 * The leaf is looked up by `(table, slug)` (single indexed lookup); for
 * multi-segment URLs the leaf's ancestor chain is then loaded via the
 * same recursive CTE `buildEntryPermalink` / `buildTermArchiveUrl` use
 * to produce nested URLs in the outbound direction. The two sides
 * round-trip on the same data.
 *
 * Returns `null` on any chain mismatch (extra segments, missing
 * intermediate, wrong ancestor slug). The route matcher falls through
 * to the next rule rather than 404'ing — WordPress's first-match-wins
 * semantics.
 */

import type { AppContext } from "../context/app.js";
import type { Entry } from "../db/schema/entries.js";
import type { Term } from "../db/schema/terms.js";
import type { User } from "../db/schema/users.js";
import { and, eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { terms } from "../db/schema/terms.js";
import { users } from "../db/schema/users.js";
import { exposesHierarchicalUrls } from "./compile.js";
import { loadAncestorSlugs, loadTermAncestorSlugs } from "./permalink.js";
import { previewTokenGrantsEntry } from "./preview.js";

export async function findEntryByPath(
  ctx: AppContext,
  entryType: string,
  segments: readonly string[],
): Promise<Entry | null> {
  if (segments.length === 0) return null;
  // Reject any empty segment — malformed URLs like /page/a//b split to
  // ["a", "", "b"] which could match against a hypothetical empty-slug
  // entry. Defense-in-depth: the slug columns are NOT NULL but don't
  // forbid the empty string.
  if (segments.some((segment) => segment === "")) return null;
  const leafSlug = segments[segments.length - 1];
  if (leafSlug === undefined) return null;

  const leaf = await ctx.db.query.entries.findFirst({
    where: and(eq(entries.type, entryType), eq(entries.slug, leafSlug)),
  });
  if (!leaf) return null;
  // Visible if published, or if a `?preview=` token grants this draft.
  // Checked before the ancestor walk so an ordinary draft 404s without the
  // extra CTE query.
  if (
    leaf.status !== "published" &&
    !(await previewTokenGrantsEntry(ctx, leaf))
  )
    return null;

  const expected = segments.slice(0, -1);
  const actual =
    leaf.parentId === null ? [] : await loadAncestorSlugs(ctx, leaf.parentId);

  return chainsMatch(actual, expected) ? leaf : null;
}

export async function findTermByPath(
  ctx: AppContext,
  taxonomy: string,
  segments: readonly string[],
): Promise<Term | null> {
  if (segments.length === 0) return null;
  if (segments.some((segment) => segment === "")) return null;
  const leafSlug = segments[segments.length - 1];
  if (leafSlug === undefined) return null;

  const leaf = await ctx.db.query.terms.findFirst({
    where: and(eq(terms.taxonomy, taxonomy), eq(terms.slug, leafSlug)),
  });
  if (!leaf) return null;

  const expected = segments.slice(0, -1);
  const actual =
    leaf.parentId === null
      ? []
      : await loadTermAncestorSlugs(ctx, leaf.parentId);

  return chainsMatch(actual, expected) ? leaf : null;
}

/**
 * The term a URL's term segments name, read the way the router compiled the
 * taxonomy: where its URLs are flat, the one segment is the term's slug whether
 * or not the term is nested; otherwise the segments are its whole slug path.
 *
 * Memoized per request, because a term page asks twice — once to resolve its
 * subject, once when its listing's `inTerm` compiles — and both must be the
 * one lookup. A miss is remembered like a hit, so a term created later in the
 * same request (a cron invocation shares one memo) stays unfound to it.
 */
export function findTermAt(
  ctx: AppContext,
  taxonomy: string,
  segments: readonly string[],
): Promise<Term | null> {
  return ctx.memo(termAtKey(taxonomy, segments), async () => {
    const registered = ctx.plugins.termTaxonomies.get(taxonomy);
    const flat =
      registered !== undefined && !exposesHierarchicalUrls(registered);
    const [slug] = segments;
    if (!flat || segments.length !== 1 || slug === undefined || slug === "") {
      return findTermByPath(ctx, taxonomy, segments);
    }
    return (
      (await ctx.db.query.terms.findFirst({
        where: and(eq(terms.taxonomy, taxonomy), eq(terms.slug, slug)),
      })) ?? null
    );
  });
}

/**
 * Remember a term loaded another way under the segments {@link findTermAt}
 * resolves it from, and return them — for a caller about to narrow a query by
 * it.
 */
export async function rememberTermSegments(
  ctx: AppContext,
  term: Term,
): Promise<readonly string[]> {
  const taxonomy = ctx.plugins.termTaxonomies.get(term.taxonomy);
  const nested = taxonomy !== undefined && exposesHierarchicalUrls(taxonomy);
  const segments =
    nested && term.parentId !== null
      ? [...(await loadTermAncestorSlugs(ctx, term.parentId)), term.slug]
      : [term.slug];
  await ctx.memo(termAtKey(term.taxonomy, segments), () =>
    Promise.resolve(term),
  );
  return segments;
}

function termAtKey(taxonomy: string, segments: readonly string[]): string {
  return `core:term-at:${JSON.stringify([taxonomy, ...segments])}`;
}

/**
 * The user an author URL's slug names. Memoized per request for the reason
 * {@link findTermAt} is: the author page and its listing's `byAuthor` ask the
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
  );
}

/** Remember a user loaded another way as the author at their slug. */
export async function rememberAuthor(
  ctx: AppContext,
  user: User,
): Promise<void> {
  await ctx.memo(authorKey(user.slug), () => Promise.resolve(user));
}

function authorKey(slug: string): string {
  return `core:author-at:${slug}`;
}

function chainsMatch(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}
