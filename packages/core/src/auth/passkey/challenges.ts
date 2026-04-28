import { and, eq, lt } from "drizzle-orm";

import type { Db } from "../../context/app.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { generateToken, hashToken } from "../tokens.js";

const CHALLENGE_TYPE = "webauthn_challenge" as const;

// Run the opportunistic sweep on a fraction of issueChallenge calls so the
// amortised cost is ~O(1) per request while still bounding table growth.
// At 10% we expect the sweep to fire ~1 in 10 registrations/logins.
const OPPORTUNISTIC_PRUNE_PROBABILITY = 0.1;

interface IssuedChallenge {
  /** Raw challenge (sent to the browser, base64url). */
  readonly challenge: string;
  readonly expiresAt: Date;
}

interface ChallengeRecord {
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
  if (Math.random() < OPPORTUNISTIC_PRUNE_PROBABILITY) {
    await pruneExpiredAuthTokens(db);
  }
  return { challenge, expiresAt };
}

/**
 * Delete every auth_tokens row whose expiresAt is in the past. Safe to call
 * at any time — consumed rows are deleted by consumeChallenge, so expired
 * rows are the only thing this ever removes. Called opportunistically from
 * issueChallenge until a scheduled-task plugin can run it on a cron.
 */
export async function pruneExpiredAuthTokens(db: Db): Promise<void> {
  await db.delete(authTokens).where(lt(authTokens.expiresAt, new Date()));
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
    .where(and(eq(authTokens.hash, hash), eq(authTokens.type, CHALLENGE_TYPE)))
    .returning();
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { userId: row.userId, expiresAt: row.expiresAt };
}
