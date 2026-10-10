import type { Db } from "../../context/app-context.js";
import { and, eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";

/** Performs no authorization; the caller decides who may cancel. */
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
