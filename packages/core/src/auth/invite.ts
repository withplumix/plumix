import type { Db } from "../context/app.js";
import type { AuthToken } from "../db/schema/auth_tokens.js";
import { eq } from "../db/index.js";
import { authTokens } from "../db/schema/auth_tokens.js";
import { hashToken } from "./tokens.js";

export class InviteError extends Error {
  static {
    InviteError.prototype.name = "InviteError";
  }

  readonly code: "invalid_token" | "token_expired";

  private constructor(code: InviteError["code"], message: string) {
    super(message);
    this.code = code;
  }

  static invalidToken(): InviteError {
    return new InviteError("invalid_token", "invalid_token");
  }

  static tokenExpired(): InviteError {
    return new InviteError("token_expired", "token_expired");
  }
}

export interface ValidInvite {
  /** SHA-256 hash of the raw token; the row's primary key. */
  readonly tokenHash: string;
  readonly userId: number;
  readonly email: string;
  readonly role: NonNullable<AuthToken["role"]>;
  readonly expiresAt: Date;
}

/**
 * Look up an invite token by hash, validate type + expiry + required fields.
 * Idempotent — does not consume the token. Call consumeInviteToken on a
 * successful acceptance so the token is single-use.
 */
export async function validateInviteToken(
  db: Db,
  rawToken: string,
): Promise<ValidInvite> {
  const tokenHash = await hashToken(rawToken);
  const row = await db.query.authTokens.findFirst({
    where: eq(authTokens.hash, tokenHash),
  });
  // Treat a non-invite token, a token with missing fields, and a missing
  // token as the same "invalid" outcome — don't leak which rows exist.
  if (row?.type !== "invite") {
    throw InviteError.invalidToken();
  }
  if (row.userId === null || row.email === null || row.role === null) {
    throw InviteError.invalidToken();
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw InviteError.tokenExpired();
  }
  return {
    tokenHash,
    userId: row.userId,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt,
  };
}

/** Delete an invite token by its hash (single-use semantics). */
export async function consumeInviteToken(
  db: Db,
  tokenHash: string,
): Promise<void> {
  await db.delete(authTokens).where(eq(authTokens.hash, tokenHash));
}
