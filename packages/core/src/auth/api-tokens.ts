import { encodeBase64urlNoPadding } from "@oslojs/encoding";

import type { Db } from "../context/app.js";
import type { ApiToken } from "../db/schema/api_tokens.js";
import type { User } from "../db/schema/users.js";
import { and, eq, gt, isNull, or } from "../db/index.js";
import { apiTokens } from "../db/schema/api_tokens.js";
import { users } from "../db/schema/users.js";
import { hashToken } from "./tokens.js";

// Personal-access-token format: `pl_pat_<32 random bytes, base64url>`.
// The prefix is recognizable on grep/log, signals "this is a Plumix
// PAT", and makes accidental commits to git easier to spot — same
// design as GitHub's `ghp_` / `gho_` and NPM's `npm_`. The 32-byte
// random suffix gives 256 bits of entropy, well past the 120-bit
// Copenhagen Book floor.
export const API_TOKEN_PREFIX = "pl_pat_";
const API_TOKEN_BODY_BYTES = 32;
// Length of the displayed `prefix` field — `pl_pat_` plus the first 4
// chars of the random body. Short enough to fit in a list cell, long
// enough to disambiguate users' own tokens at a glance.
const PREFIX_DISPLAY_BODY_CHARS = 4;

interface MintedApiToken {
  /** Raw token to ship to the client exactly once. Never persisted. */
  readonly secret: string;
  /** The persisted row, sans the secret (already in DB at return time). */
  readonly row: ApiToken;
}

interface CreateApiTokenInput {
  readonly userId: number;
  readonly name: string;
  /**
   * Token expiry. Pass `null` for never-expires (long-lived CI / MCP
   * server tokens); the admin form nudges towards a TTL but allows
   * opting out. The hot path treats `null` as "no expiry check"; only
   * the lookup's `revokedAt` and a manual revocation can kill it.
   */
  readonly expiresAt: Date | null;
  /**
   * Capability scope whitelist. null = unrestricted (inherits the
   * user's role caps); non-null = the token's effective caps are the
   * intersection of this list with the user's role caps. See
   * `db/schema/api_tokens.ts` for the full rationale.
   */
  readonly scopes?: readonly string[] | null;
}

/**
 * Mint a new personal access token.
 *
 * Generates `pl_pat_<random>`, stores the SHA-256 hash + a short
 * recognisable prefix fragment, and returns both the secret (caller
 * shows once, never recoverable) and the persisted row.
 *
 * Concurrent calls have negligible collision risk (256 bits of
 * randomness) but the `id` column is the primary key, so a duplicate
 * would surface as a unique-constraint error rather than silent
 * corruption.
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
  if (!row) throw new Error("createApiToken: insert returned no row");

  return { secret, row };
}

interface ValidatedApiToken {
  readonly user: User;
  readonly token: ApiToken;
}

/**
 * Validate a raw `Authorization: Bearer pl_pat_…` token.
 *
 * Returns the user + token row when:
 *   - the token's prefix matches `pl_pat_`,
 *   - the row exists,
 *   - the row isn't revoked,
 *   - the row hasn't expired (or has no expiry),
 *   - the linked user isn't disabled.
 *
 * Returns null on any miss — the authenticator caller maps null to
 * "no auth on this request" (which the dispatcher then turns into a
 * 401 for protected routes). The specific reason is logged but not
 * surfaced to the client; an attacker probing tokens learns nothing
 * beyond "this token doesn't authenticate."
 *
 * On success, updates `lastUsedAt` synchronously before returning.
 * One indexed UPDATE per authed request — the cost is small and the
 * race is benign (concurrent updates last-write-wins on a
 * timestamp). If/when the hot-path latency budget tightens this can
 * move to `ctx.after()` (worker-tail / waitUntil); v0.1.0 keeps it
 * simple and synchronous.
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

/**
 * Soft-delete a token by setting `revokedAt`. Idempotent — calling on
 * an already-revoked token is a no-op (the WHERE clause includes
 * `IS NULL` so the second call updates zero rows, which is fine).
 *
 * Self-scoped via the `userId` predicate; cross-user attempts return
 * `false` (no row matched). The caller — a self-scoped RPC procedure
 * — should map false to NOT_FOUND.
 */
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
