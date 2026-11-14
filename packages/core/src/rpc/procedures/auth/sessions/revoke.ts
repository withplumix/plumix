import { and, eq } from "../../../../db/index.js";
import { sessions } from "../../../../db/schema/sessions.js";
import { auth } from "../../../../events-and-filters/auth.js";
import { sessionAuthenticated } from "../../../authenticated.js";
import { coreBase } from "../../../base.js";
import { currentSessionId } from "./current.js";
import { sessionsRevokeInputSchema } from "./schemas.js";

/**
 * Refuses the current session: signing out here goes through
 * `/_plumix/auth/signout`, which also handles the IdP logout redirect.
 */
export const revoke = coreBase
  .meta({ removesCredential: true })
  .use(sessionAuthenticated)
  .input(sessionsRevokeInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (currentSessionId(context.credential) === input.id) {
      throw errors.CONFLICT({ data: { reason: "current_session" } });
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
    await context.events.emit(auth.sessionRevoked, {
      session: { id: row.id, userId: context.user.id },
      actor: context.user,
      mode: "single",
    });
    return row;
  });
