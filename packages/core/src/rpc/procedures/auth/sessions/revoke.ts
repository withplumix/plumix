import { readSessionCookie } from "../../../../auth/cookies.js";
import { hashToken } from "../../../../auth/tokens.js";
import { and, eq } from "../../../../db/index.js";
import { sessions } from "../../../../db/schema/sessions.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { sessionsRevokeInputSchema } from "./schemas.js";

/**
 * Refuses the current session: signing out here goes through
 * `/_plumix/auth/signout`, which also handles the IdP logout redirect.
 */
export const revoke = base
  .use(authenticated)
  .input(sessionsRevokeInputSchema)
  .handler(async ({ input, context, errors }) => {
    const cookieToken = readSessionCookie(context.request);
    if (cookieToken) {
      const currentId = await hashToken(cookieToken);
      if (currentId === input.id) {
        throw errors.CONFLICT({ data: { reason: "current_session" } });
      }
    }

    const [row] = await context.db
      .delete(sessions)
      .where(
        and(eq(sessions.id, input.id), eq(sessions.userId, context.user.id)),
      )
      .returning({ id: sessions.id });
    if (!row) {
      throw errors.NOT_FOUND({ data: { kind: "session", id: input.id } });
    }
    await context.hooks.doAction(
      "session:revoked",
      { id: row.id, userId: context.user.id },
      { actor: context.user, mode: "single" },
      context,
    );
    return row;
  });
