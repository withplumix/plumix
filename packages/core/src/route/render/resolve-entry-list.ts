import { eq, inArray } from "drizzle-orm";

import type { AppContext } from "../../context/app-context.js";
import type { Entry } from "../../db/schema/entries.js";
import type { Term } from "../../db/schema/terms.js";
import type { User } from "../../db/schema/users.js";
import type { RoleImages } from "../../images/contract/role-images.js";
import type { ResolvedMeta } from "../../meta/contract/bags.js";
import type {
  ResolvedAuthor,
  ResolvedEntry,
  ResolvedTerm,
} from "../contract/resolved-entry.js";
import { expandShortcodes, isEntryContent } from "../../blocks/index.js";
import { userTag } from "../../cdn/contract/tags.js";
import { memoBatch } from "../../context/memo.js";
import { entryTerm } from "../../db/schema/entry_term.js";
import { terms } from "../../db/schema/terms.js";
import { users } from "../../db/schema/users.js";
import {
  projectImageRoles,
  resolveImageRoles,
} from "../../images/role-images.js";
import { resolveEntriesMeta } from "../../meta/entry.js";
import { resolveTermsMeta } from "../../meta/term.js";
import { loadSiteSettings } from "../../seo/site-settings.js";
import {
  buildEntryPermalinkSync,
  buildTermArchiveUrlSync,
} from "../permalink.js";

type AuthorRow = Pick<User, "id" | "slug" | "name" | "avatarUrl" | "meta">;

// Role images resolve in one batch, so a page of authors costs one hydration.
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
 * Shares the per-author memo with {@link resolveEntryList}, so an author
 * archive resolves its author once.
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
    authorMemoTags,
  );
  // memoBatch answers one entry per id, and the loader has the row in hand.
  return author ?? publicAuthor(row, {});
}

const authorMemoKey = (id: number): string => `core:author:${String(id)}`;
// The author's own tag rather than the public types' tags every user change
// also purges: an entry publish announces those, and must not drop an author
// it did not touch.
const authorMemoTags = (id: number): readonly string[] => [userTag(id)];

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
 * Every surface that hands a theme a term builds it here, so none grows a field
 * the others lack.
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
 * Expands shortcodes so `[year]` reads the same in a heading, a listing and a
 * card.
 */
export async function expandEntryTitle(
  ctx: AppContext,
  entry: ResolvedEntry,
): Promise<string> {
  // A title with no tag in it reads nothing, so a batch of plain titles costs
  // no settings read — the same short-circuit `expandShortcodes` makes.
  if (!entry.title.includes("[")) return entry.title;
  const siteSettings = await loadSiteSettings(ctx);
  // Spread, not asserted: an `interface` lacks the implicit index signature a
  // shortcode's by-name read needs.
  return expandShortcodes(entry.title, ctx.shortcodes, {
    siteSettings,
    locale: ctx.locale.code,
    entry: { ...entry },
  });
}

export async function resolveEntryList(
  ctx: AppContext,
  rows: readonly Entry[],
): Promise<readonly ResolvedEntry[]> {
  if (rows.length === 0) return [];
  const entryIds = rows.map((r) => r.id);
  const authorIds = Array.from(new Set(rows.map((r) => r.authorId)));
  // Memoized per author because other loaders in the same request resolve the
  // same authors.
  const [authorRows, joinRows, metaBags] = await Promise.all([
    memoBatch(
      ctx.memo,
      authorIds,
      authorMemoKey,
      async () => {
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
      },
      authorMemoTags,
    ),
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
      .where(inArray(entryTerm.entryId, entryIds))
      // `id` tiebreaks the default-0 sortOrder so the order is deterministic.
      .orderBy(entryTerm.sortOrder, terms.id),
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
  const resolved = rows.map((row, rowIdx): ResolvedEntry => {
    const author = authorById.get(row.authorId);
    if (!author) {
      // eslint-disable-next-line no-restricted-syntax -- diagnostic throw
      throw new Error(
        `resolveEntryList: entry ${String(row.id)} references missing author ${String(row.authorId)}`,
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
  return Promise.all(
    resolved.map(async (entry) => ({
      ...entry,
      title: await expandEntryTitle(ctx, entry),
    })),
  );
}
