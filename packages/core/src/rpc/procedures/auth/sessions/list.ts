import { now } from "../../../../clock.js";
import { and, asc, eq, gt } from "../../../../db/index.js";
import { sessions } from "../../../../db/schema/sessions.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { currentSessionId } from "./current.js";
import { sessionsListInputSchema } from "./schemas.js";

/**
 * Hides expired rows that would otherwise show as active until pruned.
 * External authenticators mint no session rows, so the list is empty for
 * them rather than an error.
 */
export const list = base
  .use(authenticated)
  .input(sessionsListInputSchema)
  .handler(async ({ context }) => {
    const currentId = currentSessionId(context.credential);

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
          gt(sessions.expiresAt, now()),
        ),
      )
      .orderBy(asc(sessions.createdAt));

    return rows.map((row) => ({
      ...row,
      current: row.id === currentId,
    }));
  });
