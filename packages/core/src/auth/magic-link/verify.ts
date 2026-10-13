import type { Db } from "../../context/app-context.js";
import { and, eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { hashToken } from "../tokens.js";
import { MagicLinkError } from "./errors.js";

/**
 * Who a link was issued to: an existing user, or an address with no account
 * yet.
 */
export type MagicLinkHolder =
  { readonly userId: number } | { readonly email: string };

/**
 * Consumes the token atomically, so a concurrent second verify throws
 * `tokenInvalid`.
 */
export async function consumeMagicLinkToken(
  db: Db,
  rawToken: string,
): Promise<MagicLinkHolder> {
  const hash = await hashToken(rawToken);

  const [row] = await db
    .delete(authTokens)
    .where(and(eq(authTokens.hash, hash), eq(authTokens.type, "magic_link")))
    .returning();

  if (!row) throw MagicLinkError.tokenInvalid();
  if (row.expiresAt.getTime() < Date.now()) {
    throw MagicLinkError.tokenExpired();
  }
  // Every row `requestMagicLink` writes sets an email; a null one is
  // hand-rolled.
  if (row.email === null) throw MagicLinkError.tokenInvalid();
  if (row.userId !== null) return { userId: row.userId };
  return { email: row.email };
}
