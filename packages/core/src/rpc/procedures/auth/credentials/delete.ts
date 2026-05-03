import { and, eq, sql } from "../../../../db/index.js";
import { credentials } from "../../../../db/schema/credentials.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { credentialsDeleteInputSchema } from "./schemas.js";

// Refuse to delete the user's last credential. Without this guard, a
// user with passkey-only auth could lock themselves out by removing the
// credential they're currently signed in with — recovery would require
// admin intervention (re-issue invite). The user can still rotate by
// enrolling the new device first (`/passkey/register/options` add-
// device flow), then deleting the old one.
//
// Race-safety: the count check is folded into the DELETE's WHERE via a
// subquery so the entire decision happens inside one SQLite statement
// (per-statement isolation = atomic). Two concurrent deletes can no
// longer both observe `count = 2` and both succeed; the second one
// sees `count = 1` after the first commits and is denied.
export const del = base
  .use(authenticated)
  .input(credentialsDeleteInputSchema)
  .handler(async ({ input, context, errors }) => {
    const userId = context.user.id;
    const [row] = await context.db
      .delete(credentials)
      .where(
        and(
          eq(credentials.id, input.id),
          eq(credentials.userId, userId),
          sql`(SELECT COUNT(*) FROM ${credentials} WHERE ${credentials.userId} = ${userId}) > 1`,
        ),
      )
      .returning({ id: credentials.id });
    if (row) {
      await context.hooks.doAction(
        "credential:revoked",
        { id: row.id, userId },
        { actor: context.user },
      );
      return row;
    }

    // No row deleted — disambiguate the two failure modes so the
    // client gets the right error code. NOT_FOUND if the target
    // doesn't exist (or belongs to another user); CONFLICT if it
    // does exist but the guard refused.
    const [target] = await context.db
      .select({ id: credentials.id })
      .from(credentials)
      .where(and(eq(credentials.id, input.id), eq(credentials.userId, userId)));
    if (!target) {
      throw errors.NOT_FOUND({ data: { kind: "credential", id: input.id } });
    }
    throw errors.CONFLICT({ data: { reason: "last_credential" } });
  });
