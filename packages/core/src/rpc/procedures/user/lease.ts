import { eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { leaseProcedures } from "../../concurrency.js";
import { assertCanEditUser } from "./helpers.js";

/** Only someone who may edit the user may hold their lease. */
export const { acquire, renew, release } = leaseProcedures(
  "user",
  async (context, id, errors) => {
    const user = await context.db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.id, id),
    });
    if (!user) throw errors.NOT_FOUND({ data: { kind: "user", id } });
    assertCanEditUser(context, user, {
      forbidden: (capability) => {
        throw errors.FORBIDDEN({ data: { capability } });
      },
    });
  },
);
