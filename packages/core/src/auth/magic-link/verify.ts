import type { Db } from "../../context/app.js";
import type { User } from "../../db/schema/users.js";
import { and, eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
import { hashToken } from "../tokens.js";
import { MagicLinkError } from "./errors.js";

/**
 * Consume a magic-link token and return the matching user. Atomic
 * compare-and-delete via `DELETE … RETURNING` — a concurrent second
 * verify of the same token sees an empty result, never the same row
 * twice. Scoped by `type='magic_link'` so a hash collision with another
 * token type can't accidentally consume that row.
 */
export async function verifyMagicLink(db: Db, rawToken: string): Promise<User> {
  const hash = await hashToken(rawToken);

  const [row] = await db
    .delete(authTokens)
    .where(and(eq(authTokens.hash, hash), eq(authTokens.type, "magic_link")))
    .returning();

  if (!row) throw new MagicLinkError("token_invalid");
  if (row.expiresAt.getTime() < Date.now()) {
    throw new MagicLinkError("token_expired");
  }
  if (row.userId === null) {
    // Defensive: every magic_link row written by `requestMagicLink`
    // sets userId. A null here means hand-rolled DB state.
    throw new MagicLinkError("token_invalid");
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, row.userId),
  });
  if (!user) throw new MagicLinkError("token_invalid");
  if (user.disabledAt) throw new MagicLinkError("account_disabled");
  return user;
}
