import { and, eq } from "../../../db/index.js";
import { authTokens } from "../../../db/schema/auth_tokens.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { userPendingEmailChangeInputSchema } from "./schemas.js";

const EDIT_OWN_CAPABILITY = "user:edit_own";
const EDIT_CAPABILITY = "user:edit";

// Surface the pending email-change request for a user, if any. Used
// by the admin UI's `/users/$id/edit` to render a "pending change to
// X (cancel?)" banner so the operator knows there's a verification
// in flight before they request a new one.
//
// Returns the new email + expiresAt without exposing the raw token —
// the verification link is deliberately one-shot to the recipient's
// inbox; surfacing the token to the admin UI would defeat the
// "verify-at-new-address" guarantee.
//
// Auth: `user:edit_own` for self, `user:edit` for other (admin-only
// surfaces don't need a separate capability — same gating as
// requestEmailChange).
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
