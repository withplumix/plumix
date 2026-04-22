import { and, count, eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { otherActiveAdminExists } from "./helpers.js";
import { userDeleteInputSchema } from "./schemas.js";

const CAPABILITY = "user:delete";

export const del = base
  .use(authenticated)
  .input(userDeleteInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }

    const existing = await context.db.query.users.findFirst({
      where: eq(users.id, input.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "user", id: input.id } });
    }

    // entries.authorId FK is onDelete: restrict — reassign first or refuse.
    const [countRow] = await context.db
      .select({ value: count() })
      .from(entries)
      .where(eq(entries.authorId, existing.id));
    const postCount = countRow?.value ?? 0;

    if (postCount > 0) {
      if (input.reassignPostsTo === undefined) {
        throw errors.CONFLICT({ data: { reason: "has_posts" } });
      }
      if (input.reassignPostsTo === existing.id) {
        throw errors.CONFLICT({ data: { reason: "reassign_to_self" } });
      }
      const target = await context.db.query.users.findFirst({
        where: eq(users.id, input.reassignPostsTo),
      });
      if (!target) {
        throw errors.NOT_FOUND({
          data: { kind: "user", id: input.reassignPostsTo },
        });
      }
      await context.db
        .update(entries)
        .set({ authorId: input.reassignPostsTo })
        .where(eq(entries.authorId, existing.id));
    }

    // Atomic last-admin guard — see user/update.ts for the same pattern.
    const whereClause =
      existing.role === "admin"
        ? and(
            eq(users.id, existing.id),
            otherActiveAdminExists(context.db, existing.id),
          )
        : eq(users.id, existing.id);

    const [deleted] = await context.db
      .delete(users)
      .where(whereClause)
      .returning();
    if (!deleted) {
      if (existing.role === "admin") {
        throw errors.CONFLICT({ data: { reason: "last_admin" } });
      }
      throw errors.CONFLICT({ data: { reason: "delete_failed" } });
    }

    // WP's `deleted_user` parity. `reassignedTo` is `null` if the user
    // had no entries (no reassignment happened); otherwise carries the id
    // we migrated entries to so audit-log plugins can reconstruct the move.
    await context.hooks.doAction("user:deleted", deleted, {
      reassignedTo: postCount > 0 ? (input.reassignPostsTo ?? null) : null,
    });

    return context.hooks.applyFilter("rpc:user.delete:output", deleted);
  });
