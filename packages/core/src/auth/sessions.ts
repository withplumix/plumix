import { eq, lt } from "drizzle-orm";

import type { Db } from "../context/app.js";
import type { Session } from "../db/schema/sessions.js";
import type { User } from "../db/schema/users.js";
import { sessions } from "../db/schema/sessions.js";
import { users } from "../db/schema/users.js";
import { generateToken, hashToken } from "./tokens.js";

const SECONDS_PER_DAY = 60 * 60 * 24;

export interface SessionPolicy {
  /** Sliding-window duration. The cookie's Max-Age and DB expiresAt. */
  readonly maxAgeSeconds: number;
  /** Hard ceiling regardless of activity — re-auth required past this. */
  readonly absoluteMaxAgeSeconds: number;
  /** Refresh expiry only when more than this fraction of life has elapsed. */
  readonly refreshThreshold: number;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  maxAgeSeconds: 30 * SECONDS_PER_DAY,
  absoluteMaxAgeSeconds: 90 * SECONDS_PER_DAY,
  refreshThreshold: 0.5,
};

export interface CreateSessionInput {
  readonly userId: number;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

export interface CreatedSession {
  /** Raw token to send to the client as a cookie value. Never stored. */
  readonly token: string;
  readonly session: Session;
  readonly expiresAt: Date;
}

export interface ValidatedSession {
  readonly session: Session;
  readonly user: User;
  /** True if `expiresAt` was extended on this validation. */
  readonly refreshed: boolean;
}

/**
 * Mint a new session: random token → SHA-256 hash → row keyed by hash.
 * The raw token is returned exactly once for the cookie; the DB never sees it.
 */
export async function createSession(
  db: Db,
  input: CreateSessionInput,
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
): Promise<CreatedSession> {
  const token = generateToken();
  const id = await hashToken(token);
  const expiresAt = new Date(Date.now() + policy.maxAgeSeconds * 1000);

  const [session] = await db
    .insert(sessions)
    .values({
      id,
      userId: input.userId,
      expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning();

  if (!session) throw new Error("createSession: insert returned no row");
  return { token, session, expiresAt };
}

/**
 * Validate a raw session token from the cookie. Returns null on any failure
 * (no row, expired, beyond absolute cap). Slides expiresAt when over the
 * refresh threshold; deletes the row on absolute-cap breach so a stolen
 * token past the ceiling is purged on first use.
 */
export async function validateSession(
  db: Db,
  rawToken: string,
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
): Promise<ValidatedSession | null> {
  if (!rawToken) return null;

  const id = await hashToken(rawToken);
  const row = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .get();

  if (!row) return null;

  const now = Date.now();
  const expiresAtMs = row.session.expiresAt.getTime();
  const createdAtMs = row.session.createdAt.getTime();

  if (
    now >= expiresAtMs ||
    now >= createdAtMs + policy.absoluteMaxAgeSeconds * 1000
  ) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  if (row.user.disabledAt) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  const elapsedFraction = (now - createdAtMs) / (policy.maxAgeSeconds * 1000);
  if (elapsedFraction < policy.refreshThreshold) {
    return { session: row.session, user: row.user, refreshed: false };
  }

  const newExpiryMs = Math.min(
    now + policy.maxAgeSeconds * 1000,
    createdAtMs + policy.absoluteMaxAgeSeconds * 1000,
  );
  if (newExpiryMs === expiresAtMs) {
    return { session: row.session, user: row.user, refreshed: false };
  }

  const newExpiry = new Date(newExpiryMs);
  await db
    .update(sessions)
    .set({ expiresAt: newExpiry })
    .where(eq(sessions.id, id));
  return {
    session: { ...row.session, expiresAt: newExpiry },
    user: row.user,
    refreshed: true,
  };
}

export async function invalidateSession(
  db: Db,
  rawToken: string,
): Promise<void> {
  if (!rawToken) return;
  const id = await hashToken(rawToken);
  await db.delete(sessions).where(eq(sessions.id, id));
}

/** Used on role/permission change. */
export async function invalidateAllSessionsForUser(
  db: Db,
  userId: number,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Bulk-delete expired rows. Caller decides cadence (cron / on-demand). */
export async function pruneExpiredSessions(db: Db): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
