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
import { and, eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { terms } from "../db/schema/terms.js";
import { loadAncestorSlugs, loadTermAncestorSlugs } from "./permalink.js";

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
    where: and(
      eq(entries.type, entryType),
      eq(entries.slug, leafSlug),
      eq(entries.status, "published"),
    ),
  });
  if (!leaf) return null;

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
