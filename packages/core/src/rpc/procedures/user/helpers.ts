import type { Db } from "../../../context/app-context.js";
import { and, eq, exists, isNull, ne } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";

/**
 * Use as a WHERE predicate on the write itself, so two concurrent demotions
 * can't both pass a read-then-write check.
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
