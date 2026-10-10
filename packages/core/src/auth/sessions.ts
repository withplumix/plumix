import { eq, lt } from "drizzle-orm";

import type { AppContext, Db } from "../context/app-context.js";
import type { Session } from "../db/schema/sessions.js";
import type { User } from "../db/schema/users.js";
import type { SessionPolicy } from "./contract/sessions.js";
import { rowsAffected } from "../db/rows-affected.js";
import { sessions } from "../db/schema/sessions.js";
import { users } from "../db/schema/users.js";
import { generateToken, hashToken } from "./tokens.js";

const SECONDS_PER_DAY = 60 * 60 * 24;

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

// 64 leaves room for IPv6 zone IDs; real UA strings stay well under 1024.
const MAX_IP_LENGTH = 64;
const MAX_UA_LENGTH = 1024;

/** Advisory only, for display: never base a policy decision on these values. */
export function readClientMeta(ctx: AppContext): {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
} {
  return {
    ipAddress: clip(ctx.clientAddress ?? null, MAX_IP_LENGTH),
    userAgent: clip(ctx.request.headers.get("user-agent"), MAX_UA_LENGTH),
  };
}

function clip(value: string | null, max: number): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
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

  // eslint-disable-next-line no-restricted-syntax -- defensive driver-regression guard; migrate alongside auth errors in PR 2 (#234)
  if (!session) throw new Error("createSession: insert returned no row");
  return { token, session, expiresAt };
}

/**
 * Slides `expiresAt` past the refresh threshold, and deletes a row past the
 * absolute cap on first use.
 */
export async function validateSession(
  db: Db,
  rawToken: string,
  policy: SessionPolicy,
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

/**
 * Throws on a driver that reports no affected-row count, such as
 * `sqlite-proxy`.
 */
export async function pruneExpiredSessions(db: Db): Promise<number> {
  return rowsAffected(
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date())),
  );
}
