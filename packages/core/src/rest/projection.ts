import type { AppContext } from "../context/app.js";
import type { Entry } from "../db/schema/entries.js";
import type { PublicAuthor, PublicEntry } from "./schemas.js";
import { inArray } from "../db/index.js";
import { users } from "../db/schema/users.js";

/**
 * Explicit allowlist — default-deny. Privileged columns (authorId, sortOrder,
 * parentId, meta) and the author's email/role never appear because they are
 * not copied here; adding a column to the entries table does not leak it. The
 * shape is pinned to `publicEntrySchema`, the surface's documented contract.
 */
export function projectEntry(
  entry: Entry,
  author: PublicAuthor | null,
): PublicEntry {
  return {
    id: entry.id,
    type: entry.type,
    slug: entry.slug,
    title: entry.title,
    excerpt: entry.excerpt,
    content: entry.content,
    status: entry.status,
    publishedAt: entry.publishedAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    author,
  };
}

// Batched author lookup — one `WHERE id IN (...)` for the whole page, never a
// per-row query.
export async function loadPublicAuthors(
  ctx: AppContext,
  authorIds: readonly number[],
): Promise<Map<number, PublicAuthor>> {
  const ids = [...new Set(authorIds)];
  if (ids.length === 0) return new Map();
  const rows = await ctx.db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}
