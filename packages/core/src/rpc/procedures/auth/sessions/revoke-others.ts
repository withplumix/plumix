import { readSessionCookie } from "../../../../auth/cookies.js";
import { hashToken } from "../../../../auth/tokens.js";
import { and, eq, ne } from "../../../../db/index.js";
import { sessions } from "../../../../db/schema/sessions.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { sessionsRevokeOthersInputSchema } from "./schemas.js";

/**
 * External authenticators mint no session rows; the IdP owns the session,
 * so this returns `{ revoked: 0 }` rather than erroring.
 */
export const revokeOthers = base
  .use(authenticated)
  .input(sessionsRevokeOthersInputSchema)
  .handler(async ({ context }) => {
    const currentToken = readSessionCookie(context.request);
    if (!currentToken) {
      return { revoked: 0 };
    }
    const currentId = await hashToken(currentToken);

    const rows = await context.db
      .delete(sessions)
      .where(
        and(eq(sessions.userId, context.user.id), ne(sessions.id, currentId)),
      )
      .returning({ id: sessions.id });
    // Emit one hook per revoked row so the audit log captures each
    // device individually — better UX than a single "N revoked" entry
    // for forensic timelines.
    for (const row of rows) {
      await context.hooks.doAction(
        "session:revoked",
        { id: row.id, userId: context.user.id },
        { actor: context.user, mode: "all_others" },
        context,
      );
    }
    return { revoked: rows.length };
  });
