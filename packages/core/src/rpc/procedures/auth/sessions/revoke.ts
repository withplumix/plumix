import { readSessionCookie } from "../../../../auth/cookies.js";
import { hashToken } from "../../../../auth/tokens.js";
import { and, eq } from "../../../../db/index.js";
import { sessions } from "../../../../db/schema/sessions.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { sessionsRevokeInputSchema } from "./schemas.js";

// Revoke a single session by id, scoped to the calling user. The
// per-row complement to `revokeOthers` — used by the per-device list
// in the admin profile when the user wants to sign out one specific
// device.
//
// Refuses to revoke the current session (the cookie's session) so the
// user doesn't accidentally lock themselves out mid-flow; "sign out
// here" goes through `/_plumix/auth/signout` instead, which also
// surfaces the IdP logout redirect. NOT_FOUND for cross-user attempts
// — the WHERE pins both `id` and `userId`.
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
    return row;
  });
