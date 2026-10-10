import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

/** A row of the displayed thread, straight off the recursive CTE. */
export interface DisplayedCommentRow {
  readonly id: number;
  readonly parent_id: number | null;
  readonly author_user_id: number | null;
  readonly author_name: string;
  readonly author_email: string;
  readonly body_md: string;
  // Unix seconds: the raw CTE bypasses drizzle's timestamp codec, so this
  // is the stored integer — hence the `* 1000` when building a Date.
  readonly created_at: number;
}

interface DisplayedThreadScope {
  readonly entryId: number;
  readonly maxDepth: number;
  readonly rootIds?: readonly number[];
}

/**
 * The comments the public sees: approved roots and approved replies reached
 * through approved parents only, at depth <= `maxDepth` (root = 0).
 */
export function displayedThread({
  entryId,
  maxDepth,
  rootIds,
}: DisplayedThreadScope): SQL {
  const pageClause = rootIds
    ? sql`AND id IN (${sql.join(
        rootIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
  return sql`
    WITH RECURSIVE displayed AS (
      SELECT id, parent_id, author_user_id, author_name, author_email,
             body_md, created_at, 0 AS depth
      FROM comments
      WHERE entry_id = ${entryId} AND status = 'approved'
        AND parent_id IS NULL ${pageClause}
      UNION ALL
      SELECT c.id, c.parent_id, c.author_user_id, c.author_name,
             c.author_email, c.body_md, c.created_at, d.depth + 1
      FROM comments c
      JOIN displayed d ON c.parent_id = d.id
      WHERE c.status = 'approved' AND d.depth + 1 <= ${maxDepth}
    )
  `;
}
