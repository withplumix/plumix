import type { Db } from "../../context/app.js";
import { and, eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";

/**
 * Cancel any outstanding email-change verification for a user. The
 * caller (RPC procedure) decides whether self or admin can invoke.
 *
 * Returns the count of deleted rows so the UI can render "no
 * pending request" vs "cancelled". Idempotent — calling on a user
 * with no pending request returns 0.
 */
export async function cancelEmailChange(
  db: Db,
  input: { userId: number },
): Promise<{ cancelled: number }> {
  const rows = await db
    .delete(authTokens)
    .where(
      and(
        eq(authTokens.type, "email_verification"),
        eq(authTokens.userId, input.userId),
      ),
    )
    .returning({ hash: authTokens.hash });
  return { cancelled: rows.length };
}
