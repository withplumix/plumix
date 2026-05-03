import { readSessionCookie } from "../../../../auth/cookies.js";
import { hashToken } from "../../../../auth/tokens.js";
import { and, asc, eq, gt } from "../../../../db/index.js";
import { sessions } from "../../../../db/schema/sessions.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { sessionsListInputSchema } from "./schemas.js";

// Returns the *current user's* active sessions for the per-device
// management UI. Self-scoped — no capability check; users always see
// their own sessions. Each row carries `current: boolean` so the admin
// can label "this device" and disable the per-row revoke for it (the
// dispatcher would 401 the next request anyway, but visual affordance
// matters).
//
// Filters out rows whose `expiresAt` is in the past — those would 401
// on first use anyway and `pruneExpiredSessions` reaps them on cadence,
// but they'd briefly show as "Active" in the UI before then. The
// filter is cheap (covered by `sessions_expires_at_idx`) and removes
// the misleading affordance.
//
// External authenticators (cfAccess, custom guards) don't mint plumix
// `sessions` rows for the request user; the list will be empty in that
// case and the admin shows the cfAccess equivalent. We don't error —
// the JSDoc on `revokeOthers` makes the same call.
export const list = base
  .use(authenticated)
  .input(sessionsListInputSchema)
  .handler(async ({ context }) => {
    const cookieToken = readSessionCookie(context.request);
    const currentId = cookieToken ? await hashToken(cookieToken) : null;

    const rows = await context.db
      .select({
        id: sessions.id,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, context.user.id),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(sessions.createdAt));

    return rows.map((row) => ({
      ...row,
      current: row.id === currentId,
    }));
  });
