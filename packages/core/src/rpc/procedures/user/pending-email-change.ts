import { and, eq } from "../../../db/index.js";
import { authTokens } from "../../../db/schema/auth_tokens.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { userPendingEmailChangeInputSchema } from "./schemas.js";

const EDIT_OWN_CAPABILITY = "user:edit_own";
const EDIT_CAPABILITY = "user:edit";

// Never returns the token: surfacing it would defeat the
// verify-at-new-address guarantee.
export const pendingEmailChange = base
  .use(authenticated)
  .input(userPendingEmailChangeInputSchema)
  .handler(async ({ input, context, errors }) => {
    const isSelf = input.id === context.user.id;
    const capability = isSelf ? EDIT_OWN_CAPABILITY : EDIT_CAPABILITY;
    if (!context.auth.can(capability)) {
      throw errors.FORBIDDEN({ data: { capability } });
    }

    const target = await context.db.query.users.findFirst({
      where: eq(users.id, input.id),
    });
    if (!target) {
      throw errors.NOT_FOUND({ data: { kind: "user", id: input.id } });
    }

    const row = await context.db
      .select({
        email: authTokens.email,
        expiresAt: authTokens.expiresAt,
        createdAt: authTokens.createdAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, target.id),
          eq(authTokens.type, "email_verification"),
        ),
      )
      .get();

    if (row?.email == null) return { pending: null };
    if (row.expiresAt.getTime() < Date.now()) {
      // Expired but not pruned — surface as no-pending so the UI
      // doesn't show stale state. Cleanup runs lazily via the
      // `requestEmailChange` purge or a future prune sweep.
      return { pending: null };
    }
    return {
      pending: {
        newEmail: row.email,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      },
    };
  });
