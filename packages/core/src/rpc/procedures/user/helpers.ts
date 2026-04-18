import type { Db } from "../../../context/app.js";
import { and, eq, exists, isNull, ne } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";

/**
 * Subquery: true when an active admin OTHER than `excludeUserId` exists.
 *
 * Used as an atomic WHERE-clause predicate on UPDATE/DELETE against
 * `users` so the last-admin check happens at write time — not in a
 * read-then-write pair that two concurrent demotions could both pass.
 */
export function otherActiveAdminExists(db: Db, excludeUserId: number) {
  return exists(
    db
      .select({ v: users.id })
      .from(users)
      .where(
        and(
          eq(users.role, "admin"),
          isNull(users.disabledAt),
          ne(users.id, excludeUserId),
        ),
      ),
  );
}
