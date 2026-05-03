import { readSessionCookie } from "../../../../auth/cookies.js";
import { hashToken } from "../../../../auth/tokens.js";
import { and, eq, ne } from "../../../../db/index.js";
import { sessions } from "../../../../db/schema/sessions.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { sessionsRevokeOthersInputSchema } from "./schemas.js";

// Revoke every plumix session for the current user *except* the one
// making the call. Used by the "Sign out other devices" button on the
// profile page — the security-incident-response workflow.
//
// Two semantics worth flagging:
//
//   - Self-scoped. The WHERE clause pins `userId = ctx.user.id`; we
//     never touch other users' sessions. The "sign out everyone in
//     this org" workflow is `invalidateAllSessionsForUser` (admin-only,
//     not surfaced via this proc).
//
//   - External authenticators (cfAccess, custom guards) don't mint
//     plumix `sessions` rows — the IdP owns the session. The proc
//     still runs (the user passed the `authenticated` middleware), but
//     `readSessionCookie` returns null and there's nothing to delete.
//     We return `{ revoked: 0 }` rather than erroring; the admin's UI
//     can show "no plumix-managed sessions to revoke" and the operator
//     uses the IdP's own session-management surface.
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
      );
    }
    return { revoked: rows.length };
  });
