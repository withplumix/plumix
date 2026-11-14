import { and, eq, ne } from "../../../../db/index.js";
import { sessions } from "../../../../db/schema/sessions.js";
import { auth } from "../../../../events-and-filters/auth.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { currentSessionId } from "./current.js";
import { sessionsRevokeOthersInputSchema } from "./schemas.js";

/**
 * An identity provider's caller has no current session, so it revokes every
 * row. An API token revokes none: it isn't a session, and no scope gates this.
 */
export const revokeOthers = base
  .use(authenticated)
  .input(sessionsRevokeOthersInputSchema)
  .handler(async ({ context }) => {
    if (context.credential?.kind !== "session") return { revoked: 0 };
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
