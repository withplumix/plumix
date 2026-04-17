import { eq } from "drizzle-orm";

import type { Db } from "../../context/app.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { generateToken, hashToken } from "../tokens.js";

const CHALLENGE_TYPE = "webauthn_challenge" as const;

export interface IssuedChallenge {
  /** Raw challenge (sent to the browser, base64url). */
  readonly challenge: string;
  readonly expiresAt: Date;
}

export interface ChallengeRecord {
  readonly userId: number | null;
  readonly expiresAt: Date;
}

/**
 * Persist a single-use WebAuthn challenge. We hash the raw challenge and
 * store the hash so a DB read does not yield a usable challenge to an
 * attacker (defence in depth — the challenge is also short-lived).
 */
export async function issueChallenge(
  db: Db,
  ttlMs: number,
  userId: number | null = null,
): Promise<IssuedChallenge> {
  const challenge = generateToken();
  const hash = await hashToken(challenge);
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(authTokens).values({
    hash,
    type: CHALLENGE_TYPE,
    userId,
    expiresAt,
  });
  return { challenge, expiresAt };
}

/**
 * Atomic single-use consume: SQLite `RETURNING` deletes and reads the row in
 * one round-trip — no race window between read and delete (Copenhagen Book:
 * "atomic deletion to prevent race conditions").
 */
export async function consumeChallenge(
  db: Db,
  rawChallenge: string,
): Promise<ChallengeRecord | null> {
  if (!rawChallenge) return null;
  const hash = await hashToken(rawChallenge);
  const [row] = await db
    .delete(authTokens)
    .where(eq(authTokens.hash, hash))
    .returning();
  if (row?.type !== CHALLENGE_TYPE) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { userId: row.userId, expiresAt: row.expiresAt };
}
