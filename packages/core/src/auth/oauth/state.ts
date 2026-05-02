import type { Db } from "../../context/app.js";
import type { OAuthProviderKey } from "./types.js";
import { eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { generateToken, hashToken } from "../tokens.js";

export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface OAuthStatePayload {
  readonly provider: OAuthProviderKey;
  readonly codeVerifier: string;
}

export interface IssuedOAuthState {
  /** Raw state token to send to the provider via the URL. Never persisted. */
  readonly state: string;
  readonly expiresAt: Date;
}

/**
 * Store oauth_state in `auth_tokens` keyed by SHA-256(state). The raw token
 * lives only in the URL round-trip; a DB snapshot leak yields hashes, not
 * forgeable states. Single-use semantics enforced by `consumeOAuthState`.
 */
export async function issueOAuthState(
  db: Db,
  payload: OAuthStatePayload,
  ttlSeconds: number = OAUTH_STATE_TTL_SECONDS,
): Promise<IssuedOAuthState> {
  const state = generateToken();
  const hash = await hashToken(state);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await db.insert(authTokens).values({
    hash,
    type: "oauth_state",
    payload: { ...payload },
    expiresAt,
  });
  return { state, expiresAt };
}

export async function consumeOAuthState(
  db: Db,
  state: string,
): Promise<OAuthStatePayload | null> {
  const hash = await hashToken(state);
  const row = await db.query.authTokens.findFirst({
    where: eq(authTokens.hash, hash),
  });
  if (row?.type !== "oauth_state") return null;

  // Single-use regardless of expiry: a replay should never succeed even if
  // the row hasn't been pruned. Delete first, then evaluate validity.
  await db.delete(authTokens).where(eq(authTokens.hash, hash));

  if (row.expiresAt.getTime() < Date.now()) return null;

  const payload = row.payload as Partial<OAuthStatePayload> | null;
  if (
    typeof payload?.provider !== "string" ||
    typeof payload.codeVerifier !== "string"
  ) {
    return null;
  }
  return {
    provider: payload.provider,
    codeVerifier: payload.codeVerifier,
  };
}
