import { eq, inArray } from "drizzle-orm";

import { isEntryContent } from "@plumix/blocks";

import type { AppContext } from "../../context/app.js";
import type { Entry } from "../../db/schema/entries.js";
import type { Term } from "../../db/schema/terms.js";
import type { ResolvedEntry } from "./resolved-entry.js";
import { entryTerm } from "../../db/schema/entry_term.js";
import { terms } from "../../db/schema/terms.js";
import { users } from "../../db/schema/users.js";
import {
  buildEntryPermalinkSync,
  buildTermArchiveUrlSync,
} from "../permalink.js";

/**
 * Hydrate raw entry rows into `ResolvedEntry` — author, terms, and the
 * basePath-correct permalink each entry needs for rendering. Batched
 * (mirrors WordPress's `update_post_caches`): one `IN(...)` query for
 * authors, one entry_term×terms join for terms — no N+1 per entry.
 */
export async function buildResolvedEntries(
  ctx: AppContext,
  rows: readonly Entry[],
): Promise<readonly ResolvedEntry[]> {
  if (rows.length === 0) return [];
  const entryIds = rows.map((r) => r.id);
  const authorIds = Array.from(new Set(rows.map((r) => r.authorId)));
  const [authorRows, joinRows] = await Promise.all([
    ctx.db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, authorIds)),
    ctx.db
      .select({
        entryId: entryTerm.entryId,
        id: terms.id,
        taxonomy: terms.taxonomy,
        name: terms.name,
        slug: terms.slug,
        description: terms.description,
        meta: terms.meta,
        parentId: terms.parentId,
        version: terms.version,
      })
      .from(entryTerm)
      .innerJoin(terms, eq(entryTerm.termId, terms.id))
      .where(inArray(entryTerm.entryId, entryIds)),
  ]);
  const authorById = new Map(authorRows.map((a) => [a.id, a]));
  const termsByEntryId = new Map<number, Term[]>();
  for (const row of joinRows) {
    const { entryId, ...term } = row;
    const bucket = termsByEntryId.get(entryId) ?? [];
    bucket.push(term);
    termsByEntryId.set(entryId, bucket);
  }
  return rows.map((row) => {
    const author = authorById.get(row.authorId);
    if (!author) {
      // eslint-disable-next-line no-restricted-syntax -- diagnostic throw
      throw new Error(
        `buildResolvedEntries: entry ${String(row.id)} references missing author ${String(row.authorId)}`,
      );
    }
    return {
      ...row,
      contentBlocks: isEntryContent(row.content) ? row.content : null,
      // Sync term URLs — no per-term CTE (nested terms get null, like entries).
      terms: (termsByEntryId.get(row.id) ?? []).map((term) => ({
        ...term,
        url: buildTermArchiveUrlSync(ctx, term),
      })),
      author,
      url: buildEntryPermalinkSync(ctx, row),
    };
  });
}
