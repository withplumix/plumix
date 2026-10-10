import { and, eq, sql } from "../../../../db/index.js";
import { credentials } from "../../../../db/schema/credentials.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { credentialsDeleteInputSchema } from "./schemas.js";

// Refuses to delete the last credential, so a passkey-only user can't lock
// themselves out. The count check sits in the DELETE's WHERE so concurrent
// deletes can't both pass.
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
        context,
      );
      return row;
    }

    // NOT_FOUND when the target is missing or another user's; CONFLICT when the
    // last-credential guard refused.
    const [target] = await context.db
      .select({ id: credentials.id })
      .from(credentials)
      .where(and(eq(credentials.id, input.id), eq(credentials.userId, userId)));
    if (!target) {
      throw errors.NOT_FOUND({ data: { kind: "credential", id: input.id } });
    }
    throw errors.CONFLICT({ data: { reason: "last_credential" } });
  });
