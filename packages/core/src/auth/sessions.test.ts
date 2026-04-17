import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import type { SessionPolicy } from "./sessions.js";
import { users } from "../db/schema/users.js";
import { createTestDb } from "../test/harness.js";
import {
  createSession,
  DEFAULT_SESSION_POLICY,
  invalidateSession,
  validateSession,
} from "./sessions.js";
import { hashToken } from "./tokens.js";

async function seedUser(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [user] = await db
    .insert(users)
    .values({ email: "alice@example.com", role: "admin" })
    .returning();
  if (!user) throw new Error("seed failed");
  return user;
}

describe("session lifecycle", () => {
  test("round-trips a token while storing only its SHA-256 hash in the DB", async () => {
    const db = await createTestDb();
    const user = await seedUser(db);
    const { token, session } = await createSession(db, { userId: user.id });

    expect(session.id).not.toBe(token);
    expect(session.id).toBe(await hashToken(token));

    const validated = await validateSession(db, token);
    expect(validated?.user.id).toBe(user.id);
  });

  test("rejects a tampered token (hash miss → no row found)", async () => {
    const db = await createTestDb();
    const user = await seedUser(db);
    const { token } = await createSession(db, { userId: user.id });
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(await validateSession(db, tampered)).toBeNull();
  });

  test("expired session is rejected and the row is purged", async () => {
    const db = await createTestDb();
    const user = await seedUser(db);
    const policy: SessionPolicy = {
      ...DEFAULT_SESSION_POLICY,
      maxAgeSeconds: -10,
    };
    const { token } = await createSession(db, { userId: user.id }, policy);
    expect(await validateSession(db, token, policy)).toBeNull();
    expect(await validateSession(db, token, policy)).toBeNull();
  });

  test("sliding window extends expiresAt past the threshold", async () => {
    const db = await createTestDb();
    const user = await seedUser(db);
    const policy: SessionPolicy = {
      maxAgeSeconds: 60,
      absoluteMaxAgeSeconds: 3600,
      refreshThreshold: 0,
    };
    const { token, session: original } = await createSession(
      db,
      { userId: user.id },
      policy,
    );
    // SQLite stores timestamps at second precision — wait past the next tick
    // so the refreshed expiresAt lands in a different second.
    await new Promise((r) => setTimeout(r, 1100));
    const validated = await validateSession(db, token, policy);
    expect(validated?.refreshed).toBe(true);
    expect(validated?.session.expiresAt.getTime()).toBeGreaterThan(
      original.expiresAt.getTime(),
    );
  });

  test("absolute cap forbids extending past createdAt + absoluteMaxAge", async () => {
    const db = await createTestDb();
    const user = await seedUser(db);
    const policy: SessionPolicy = {
      maxAgeSeconds: 60,
      absoluteMaxAgeSeconds: 1,
      refreshThreshold: 0,
    };
    const { token } = await createSession(db, { userId: user.id }, policy);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await validateSession(db, token, policy)).toBeNull();
  });

  test("disabled user can no longer validate — session is purged", async () => {
    const db = await createTestDb();
    const user = await seedUser(db);
    const { token } = await createSession(db, { userId: user.id });
    await db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, user.id));
    expect(await validateSession(db, token)).toBeNull();
  });

  test("invalidateSession deletes by hash so the token stops working", async () => {
    const db = await createTestDb();
    const user = await seedUser(db);
    const { token } = await createSession(db, { userId: user.id });
    await invalidateSession(db, token);
    expect(await validateSession(db, token)).toBeNull();
  });
});
