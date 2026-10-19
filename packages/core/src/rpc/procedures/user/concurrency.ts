import type { Db } from "../../../context/app-context.js";
import type { NewUser, User } from "../../../db/schema/users.js";
import { guardedTable } from "../../../db/concurrency.js";
import { and, eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { ifMatchMessage } from "../../concurrency.js";

export const USER_IF_MATCH_MESSAGE = ifMatchMessage("user");

/** How the guarded writes reach `users`. */
export function userRows(db: Db) {
  return guardedTable<User, Partial<NewUser>>({
    kind: "user",
    updatedAt: users.updatedAt,
    update: async (id, set, where) => {
      const [row] = await db
        .update(users)
        .set(set)
        .where(and(eq(users.id, id), where))
        .returning();
      return row;
    },
    read: (id) => db.query.users.findFirst({ where: eq(users.id, id) }),
  });
}
