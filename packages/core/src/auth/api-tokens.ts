import { encodeBase64urlNoPadding } from "@oslojs/encoding";

import type { Db } from "../context/app-context.js";
import type { ApiToken } from "../db/schema/api_tokens.js";
import type { User } from "../db/schema/users.js";
import { and, eq, gt, isNull, or } from "../db/index.js";
import { apiTokens } from "../db/schema/api_tokens.js";
import { users } from "../db/schema/users.js";
import { hashToken } from "./tokens.js";

/**
 * A fixed prefix makes leaked tokens greppable and secret-scannable, like
 * GitHub's `ghp_`.
 */
export const API_TOKEN_PREFIX = "pl_pat_";
const API_TOKEN_BODY_BYTES = 32;
/** Short enough for a list cell, long enough to tell a user's tokens apart. */
const PREFIX_DISPLAY_BODY_CHARS = 4;

export interface MintedApiToken {
  /** Raw token to ship to the client exactly once. Never persisted. */
  readonly secret: string;
  /** The persisted row, sans the secret (already in DB at return time). */
  readonly row: ApiToken;
}

export interface CreateApiTokenInput {
  readonly userId: number;
  readonly name: string;
  /** `null` never expires; only revocation ends such a token. */
  readonly expiresAt: Date | null;
  /**
   * `null` inherits the user's role caps; a list narrows them to the
   * intersection.
   */
  readonly scopes?: readonly string[] | null;
}

/**
 * Only the hash is stored, so the returned `secret` cannot be recovered later.
 */
export async function createApiToken(
  db: Db,
  input: CreateApiTokenInput,
): Promise<MintedApiToken> {
  const secret = generateApiTokenSecret();
  const id = await hashToken(secret);
  const prefix = secret.slice(
    0,
    API_TOKEN_PREFIX.length + PREFIX_DISPLAY_BODY_CHARS,
  );

  const [row] = await db
    .insert(apiTokens)
    .values({
      id,
      userId: input.userId,
      name: input.name,
      prefix,
      expiresAt: input.expiresAt,
      scopes: input.scopes ?? null,
    })
    .returning();
  // eslint-disable-next-line no-restricted-syntax -- unreachable unless the driver returns no row from INSERT … RETURNING
  if (!row) throw new Error("createApiToken: insert returned no row");

  return { secret, row };
}

interface ValidatedApiToken {
  readonly user: User;
  readonly token: ApiToken;
}

/**
 * Returns null for every failure reason alike, so a token prober learns nothing
 * more. Writes `lastUsedAt` before returning.
 */
export async function validateApiToken(
  db: Db,
  rawToken: string,
): Promise<ValidatedApiToken | null> {
  if (!rawToken.startsWith(API_TOKEN_PREFIX)) return null;

  const id = await hashToken(rawToken);
  const now = new Date();

  // Single statement: row exists AND not revoked AND (no expiry OR
  // not yet expired). Hits the PK index for the lookup; the WHERE
  // additions are constant-time per row.
  const row = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(
      and(
        eq(apiTokens.id, id),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, now)),
      ),
    )
    .get();

  if (!row) return null;
  if (row.user.disabledAt) return null;

  // Update lastUsedAt non-blocking on the request hot path; failure
  // here doesn't affect auth (the user is already authenticated).
  await db
    .update(apiTokens)
    .set({ lastUsedAt: now })
    .where(eq(apiTokens.id, id));

  return { user: row.user, token: row.token };
}

/** Returns `false` for another user's token or one already revoked. */
export async function revokeApiToken(
  db: Db,
  input: { id: string; userId: number },
): Promise<boolean> {
  const result = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiTokens.id, input.id),
        eq(apiTokens.userId, input.userId),
        isNull(apiTokens.revokedAt),
      ),
    )
    .returning({ id: apiTokens.id });
  return result.length > 0;
}

function generateApiTokenSecret(): string {
  const bytes = new Uint8Array(API_TOKEN_BODY_BYTES);
  crypto.getRandomValues(bytes);
  return `${API_TOKEN_PREFIX}${encodeBase64urlNoPadding(bytes)}`;
}
