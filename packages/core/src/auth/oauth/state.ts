import type { Db } from "../../context/app-context.js";
import { and, eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { generateToken, hashToken } from "../tokens.js";

const OAUTH_STATE_TTL_SECONDS = 10 * 60;

interface OAuthStatePayload {
  readonly provider: string;
  readonly codeVerifier: string;
  /**
   * Kept server-side, not in the URL, so it can't be tampered with between
   * start and callback.
   */
  readonly redirectTo?: string;
}

interface IssuedOAuthState {
  /** Never persisted; only its hash is stored. */
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

  // Atomic compare-and-delete so a concurrent consume gets nothing; scoped by
  // type so it can't consume another token kind.
  const [row] = await db
    .delete(authTokens)
    .where(and(eq(authTokens.hash, hash), eq(authTokens.type, "oauth_state")))
    .returning();

  if (!row) return null;
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
    // Only surface a string; the callback re-validates it against
    // `isSafeRedirect` before honouring, so a hand-rolled row can't inject
    // an off-origin destination here.
    ...(typeof payload.redirectTo === "string"
      ? { redirectTo: payload.redirectTo }
      : {}),
  };
}
