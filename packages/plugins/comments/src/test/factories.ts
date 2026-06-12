import { Factory } from "fishery";

import type { Comment, NewComment } from "../db/schema.js";
import type { CommentsTestDb } from "./db.js";
import { comments } from "../db/schema.js";

interface DbTransient {
  db: CommentsTestDb;
}

function requireDb(transient: Partial<DbTransient>): CommentsTestDb {
  if (!transient.db) {
    // eslint-disable-next-line no-restricted-syntax -- test-support guard
    throw new Error("commentFactory requires a db via .transient({ db })");
  }
  return transient.db;
}

/**
 * Seeds a `comments` row. Requires `entryId` (a comment with no entry is
 * meaningless); everything else has a sane default, with `status`
 * defaulting to `pending` to mirror the table default. Pair with the
 * core `factoriesFor(db)` to create the entry/user it points at.
 */
export const commentFactory = Factory.define<NewComment, DbTransient, Comment>(
  ({ sequence, transientParams, onCreate, params }) => {
    onCreate(async (attrs) => {
      const db = requireDb(transientParams);
      const [row] = await db.insert(comments).values(attrs).returning();
      // eslint-disable-next-line no-restricted-syntax -- test-support guard
      if (!row) throw new Error("commentFactory: insert returned no row");
      return row;
    });

    const entryId = params.entryId;
    if (entryId === undefined) {
      // eslint-disable-next-line no-restricted-syntax -- test-support guard
      throw new Error("commentFactory: entryId is required");
    }

    return {
      entryId,
      parentId: params.parentId ?? null,
      status: params.status ?? "pending",
      authorUserId: params.authorUserId ?? null,
      authorName: params.authorName ?? `Commenter ${String(sequence)}`,
      authorEmail:
        params.authorEmail ?? `commenter-${String(sequence)}@example.test`,
      bodyMd: params.bodyMd ?? `Comment body ${String(sequence)}`,
      ipHash: params.ipHash ?? null,
      userAgent: params.userAgent ?? null,
    };
  },
);
