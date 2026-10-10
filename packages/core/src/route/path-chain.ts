// A chain mismatch returns null so the matcher falls through to the next rule
// rather than 404ing (WordPress first-match-wins).

import type { AppContext } from "../context/app-context.js";
import type { Entry } from "../db/schema/entries.js";
import { and, eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { loadAncestorSlugs } from "./permalink.js";
import { previewTokenGrantsEntry } from "./preview.js";

export async function findEntryByPath(
  ctx: AppContext,
  entryType: string,
  segments: readonly string[],
): Promise<Entry | null> {
  if (segments.length === 0) return null;
  // Reject empty segments (`/a//b`): slug columns are NOT NULL but allow the
  // empty string.
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
