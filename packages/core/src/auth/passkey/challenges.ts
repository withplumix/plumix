import { and, eq, lt } from "drizzle-orm";
import * as v from "valibot";

import type { Db } from "../../context/app-context.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { generateToken, hashToken } from "../tokens.js";

const CHALLENGE_TYPE = "webauthn_challenge" as const;

// Each register-verify route accepts only its own ceremony, so an attestation
// can't be redirected past that ceremony's checks.
const ceremonySchema = v.picklist(["bootstrap", "add-device", "invite"]);
export type RegistrationCeremony = v.InferOutput<typeof ceremonySchema>;

// Sampling keeps the sweep's amortised cost low while still bounding table
// growth.
const OPPORTUNISTIC_PRUNE_PROBABILITY = 0.1;

interface IssuedChallenge {
  readonly challenge: string;
  readonly expiresAt: Date;
}

interface ChallengeRecord {
  readonly userId: number | null;
  // Null for authentication challenges, which no registration route accepts.
  readonly ceremony: RegistrationCeremony | null;
  readonly expiresAt: Date;
}

/** Stores only the hash, so a DB read doesn't yield a usable challenge. */
export async function issueChallenge(
  db: Db,
  ttlMs: number,
  userId: number | null = null,
  ceremony: RegistrationCeremony | null = null,
): Promise<IssuedChallenge> {
  const challenge = generateToken();
  const hash = await hashToken(challenge);
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(authTokens).values({
    hash,
    type: CHALLENGE_TYPE,
    userId,
    // Decided when the options request still knew who was signed in; the
    // session may be gone by the time verify consumes the challenge.
    payload: ceremony ? { ceremony } : null,
    expiresAt,
  });
  if (Math.random() < OPPORTUNISTIC_PRUNE_PROBABILITY) {
    await pruneExpiredAuthTokens(db);
  }
  return { challenge, expiresAt };
}

/**
 * Deletes expired rows of every token type, not just challenges. Safe to call
 * at any time.
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
  const parsed = v.safeParse(ceremonySchema, row.payload?.ceremony);
  return {
    userId: row.userId,
    ceremony: parsed.success ? parsed.output : null,
    expiresAt: row.expiresAt,
  };
}
