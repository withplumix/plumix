import { and, eq, ne } from "../../../../db/index.js";
import { sessions } from "../../../../db/schema/sessions.js";
import { auth } from "../../../../events-and-filters/auth.js";
import { sessionAuthenticated } from "../../../authenticated.js";
import { coreBase } from "../../../base.js";
import { currentSessionId } from "./current.js";
import { sessionsRevokeOthersInputSchema } from "./schemas.js";

/**
 * An identity provider's caller has no current session, so it revokes every
 * row.
 */
export const revokeOthers = coreBase
  .meta({ removesCredential: true })
  .use(sessionAuthenticated)
  .input(sessionsRevokeOthersInputSchema)
  .handler(async ({ context }) => {
    const currentId = currentSessionId(context.credential);

    const rows = await context.db
      .delete(sessions)
      .where(
        and(
          eq(sessions.userId, context.user.id),
          currentId === undefined ? undefined : ne(sessions.id, currentId),
        ),
      )
      .returning({ id: sessions.id });
    // Emit one event per revoked row so the audit log captures each
    // device individually — better UX than a single "N revoked" entry
    // for forensic timelines.
    for (const row of rows) {
      await context.events.emit(auth.sessionRevoked, {
        session: { id: row.id, userId: context.user.id },
        actor: context.user,
        mode: "all_others",
      });
    }
    return { revoked: rows.length };
  });
