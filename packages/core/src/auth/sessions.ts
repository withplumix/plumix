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

// Bounds for the values we persist. Real-world UA strings are typically
// 100-400 chars; 1024 leaves headroom while bounding row width on
// hostile / malformed input. IPs are at most 45 chars (IPv6) — 64 gives
// space for IPv6 zone IDs without going wild.
const MAX_IP_LENGTH = 64;
const MAX_UA_LENGTH = 1024;

/**
 * Pull the client IP + user-agent off a request for `sessions.ipAddress`
 * / `sessions.userAgent`. Prefers `cf-connecting-ip` (set by Cloudflare
 * Access / Workers / CDN) over `x-forwarded-for` (which can be a chain
 * — pick the first hop). Falls back to null when neither header is
 * present. Truncates aggressively so a misconfigured upstream can't
 * blow up the row width.
 *
 * Used at every `createSession` call site so the per-session admin UI
 * can surface meaningful "what device / where from" context for the
 * "is this me?" workflow. The values are advisory: an attacker who
 * controls the request can spoof both, so policy decisions still flow
 * through the session id (hash-keyed, server-issued).
 */
export function readRequestMeta(request: Request): {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
} {
  const cfIp = request.headers.get("cf-connecting-ip");
  const xff = request.headers.get("x-forwarded-for");
  // x-forwarded-for is comma-separated when multiple proxies appended;
  // the leftmost entry is the original client (per RFC 7239 / common
  // proxy convention).
  const fallback = xff?.split(",")[0]?.trim() ?? null;
  const rawIp = cfIp ?? fallback ?? null;
  const rawUa = request.headers.get("user-agent");
  return {
    ipAddress: clip(rawIp, MAX_IP_LENGTH),
    userAgent: clip(rawUa, MAX_UA_LENGTH),
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
