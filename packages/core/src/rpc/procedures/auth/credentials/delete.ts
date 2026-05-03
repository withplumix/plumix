import { and, eq } from "../../../../db/index.js";
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
export const del = base
  .use(authenticated)
  .input(credentialsDeleteInputSchema)
  .handler(async ({ input, context, errors }) => {
    const owned = await context.db.$count(
      credentials,
      eq(credentials.userId, context.user.id),
    );
    if (owned <= 1) {
      throw errors.CONFLICT({ data: { reason: "last_credential" } });
    }

    const [row] = await context.db
      .delete(credentials)
      .where(
        and(
          eq(credentials.id, input.id),
          eq(credentials.userId, context.user.id),
        ),
      )
      .returning({ id: credentials.id });
    if (!row) {
      throw errors.NOT_FOUND({ data: { kind: "credential", id: input.id } });
    }
    return row;
  });
