import { eq, inArray } from "drizzle-orm";

import { isEntryContent } from "@plumix/blocks";

import type { AppContext } from "../../context/app.js";
import type { Entry } from "../../db/schema/entries.js";
import type { Term } from "../../db/schema/terms.js";
import type { User } from "../../db/schema/users.js";
import type { RoleImages } from "../../images/role-images.js";
import type { ResolvedMeta } from "../../rpc/meta/core.js";
import type {
  ResolvedAuthor,
  ResolvedEntry,
  ResolvedTerm,
} from "./resolved-entry.js";
import { memoBatch } from "../../context/memo.js";
import { entryTerm } from "../../db/schema/entry_term.js";
import { terms } from "../../db/schema/terms.js";
import { users } from "../../db/schema/users.js";
import {
  projectImageRoles,
  resolveImageRoles,
} from "../../images/role-images.js";
import { resolveEntriesMeta } from "../../rpc/procedures/entry/meta.js";
import { resolveTermsMeta } from "../../rpc/procedures/term/meta.js";
import {
  buildEntryPermalinkSync,
  buildTermArchiveUrlSync,
} from "../permalink.js";

/** The user columns an author projection is allowed to read. */
type AuthorRow = Pick<User, "id" | "slug" | "name" | "avatarUrl" | "meta">;

/**
 * Project user rows into the public-safe author a template reads, resolving
 * every author's role images in one batch: the whole set's stored ids go
 * through `resolveImageRoles` together, so a page of authors costs one
 * hydration — and a site whose users declare no role field costs none, because
 * there are no ids to hydrate.
 */
async function resolveAuthors(
  ctx: AppContext,
  rows: readonly AuthorRow[],
): Promise<ResolvedAuthor[]> {
  const images = await resolveImageRoles(
    ctx,
    { kind: "user" },
    rows.map((row) => row.meta),
  );
  return rows.map((row, index) => publicAuthor(row, images[index] ?? {}));
}

/**
 * One author, from a row the caller already has. Shares the per-author request
 * memo with {@link buildResolvedEntries}, so an author archive — which
 * resolves its subject and then lists that same author's entries — projects
 * and hydrates them once, not twice.
 */
export async function resolveAuthorRow(
  ctx: AppContext,
  row: AuthorRow,
): Promise<ResolvedAuthor> {
  const [author] = await memoBatch(
    ctx.memo,
    [row.id],
    authorMemoKey,
    async () =>
      new Map((await resolveAuthors(ctx, [row])).map((a) => [a.id, a])),
  );
  // memoBatch answers one entry per id, and the loader has the row in hand.
  return author ?? publicAuthor(row, {});
}

const authorMemoKey = (id: number): string => `core:author:${String(id)}`;

// The projection itself — never spread the user row, which carries email and
// the auth columns.
function publicAuthor(row: AuthorRow, images: RoleImages): ResolvedAuthor {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    avatarUrl: row.avatarUrl,
    images,
  };
}

/**
 * A term as a template reads it: the row, its decoded meta, the stored bag a
 * rule predicate compares against, its role images, and its archive URL. Both
 * surfaces that hand a theme a term — the entry's attachments here, and the
 * taxonomy page's own subject — build it through this, so neither can grow a
 * field the other lacks.
 */
export function resolveTerm(
  ctx: AppContext,
  term: Term,
  meta: ResolvedMeta,
  url: string | null,
): ResolvedTerm {
  return {
    ...term,
    meta,
    storedMeta: term.meta,
    images: projectImageRoles(
      ctx.plugins,
      { kind: "term", taxonomy: term.taxonomy },
      meta,
    ),
    url,
  };
}

/**
 * Resolve raw entry rows into `ResolvedEntry` — author, terms, and the
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
  // Per-author request memo (#1493): entry resolution and the blog
  // related-posts loader resolve the same author in one request — the
  // second call replays the row, and a mixed batch still costs a single
  // `IN(...)` query.
  const [authorRows, joinRows, metaBags] = await Promise.all([
    memoBatch(ctx.memo, authorIds, authorMemoKey, async () => {
      const rows = await ctx.db
        .select({
          id: users.id,
          slug: users.slug,
          name: users.name,
          avatarUrl: users.avatarUrl,
          meta: users.meta,
        })
        .from(users)
        .where(inArray(users.id, authorIds));
      const authors = await resolveAuthors(ctx, rows);
      return new Map(authors.map((a) => [a.id, a]));
    }),
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
    // Templates read `entry.meta.<field>` as the adapter's hydrated
    // shape — one level deep; a summary carries no meta of its own.
    resolveEntriesMeta(ctx, rows),
  ]);
  // Not inside the Promise.all: the bags key off the join rows. A term
  // set with no reference fields costs no extra query.
  const termMetaBags = await resolveTermsMeta(ctx, joinRows);
  const authorById = new Map(
    authorRows.filter((a) => a !== null).map((a) => [a.id, a]),
  );
  const termsByEntryId = new Map<number, ResolvedTerm[]>();
  for (const [termIdx, row] of joinRows.entries()) {
    const { entryId, ...term } = row;
    const bucket = termsByEntryId.get(entryId) ?? [];
    // Sync term URLs — no per-term CTE (nested terms get null, like entries).
    bucket.push(
      resolveTerm(
        ctx,
        term,
        termMetaBags[termIdx] ?? {},
        buildTermArchiveUrlSync(ctx, term),
      ),
    );
    termsByEntryId.set(entryId, bucket);
  }
  return rows.map((row, rowIdx) => {
    const author = authorById.get(row.authorId);
    if (!author) {
      // eslint-disable-next-line no-restricted-syntax -- diagnostic throw
      throw new Error(
        `buildResolvedEntries: entry ${String(row.id)} references missing author ${String(row.authorId)}`,
      );
    }
    const meta = metaBags[rowIdx] ?? {};
    return {
      ...row,
      meta,
      storedMeta: row.meta,
      images: projectImageRoles(
        ctx.plugins,
        { kind: "entry", entryType: row.type },
        meta,
      ),
      contentBlocks: isEntryContent(row.content) ? row.content : null,
      terms: termsByEntryId.get(row.id) ?? [],
      author,
      url: buildEntryPermalinkSync(ctx, row),
    };
  });
}
