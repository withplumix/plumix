import { describe, expect, test } from "vitest";

import { eq } from "../db/index.js";
import { apiTokens } from "../db/schema/api_tokens.js";
import { users } from "../db/schema/users.js";
import { userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import {
  API_TOKEN_PREFIX,
  createApiToken,
  revokeApiToken,
  validateApiToken,
} from "./api-tokens.js";

describe("createApiToken", () => {
  test("returns a `pl_pat_`-prefixed secret and stores only the hash", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});

    const { secret, row } = await createApiToken(db, {
      userId: user.id,
      name: "ci",
      expiresAt: null,
    });

    expect(secret.startsWith(API_TOKEN_PREFIX)).toBe(true);
    // The PK we get back is the hash, not the secret itself.
    expect(row.id).not.toBe(secret);
    expect(row.id.length).toBeGreaterThan(0);
    expect(row.prefix.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(row.userId).toBe(user.id);
    expect(row.name).toBe("ci");
    expect(row.expiresAt).toBeNull();
    expect(row.revokedAt).toBeNull();

    // Persisted row matches.
    const stored = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, row.id))
      .get();
    expect(stored?.id).toBe(row.id);
  });

  test("two consecutive mints yield distinct secrets and rows", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});

    const a = await createApiToken(db, {
      userId: user.id,
      name: "a",
      expiresAt: null,
    });
    const b = await createApiToken(db, {
      userId: user.id,
      name: "b",
      expiresAt: null,
    });

    expect(a.secret).not.toBe(b.secret);
    expect(a.row.id).not.toBe(b.row.id);
  });
});

describe("validateApiToken", () => {
  test("returns the user + token row for a freshly minted token", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { secret, row } = await createApiToken(db, {
      userId: user.id,
      name: "t",
      expiresAt: null,
    });

    const result = await validateApiToken(db, secret);
    expect(result?.user.id).toBe(user.id);
    expect(result?.token.id).toBe(row.id);
  });

  test("bumps lastUsedAt on success", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { secret, row } = await createApiToken(db, {
      userId: user.id,
      name: "t",
      expiresAt: null,
    });
    expect(row.lastUsedAt).toBeNull();

    await validateApiToken(db, secret);

    const refreshed = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, row.id))
      .get();
    expect(refreshed?.lastUsedAt).not.toBeNull();
  });

  test("returns null for an unknown token", async () => {
    const db = await createTestDb();
    const result = await validateApiToken(db, `${API_TOKEN_PREFIX}garbage`);
    expect(result).toBeNull();
  });

  test("returns null when the token doesn't carry the plumix prefix", async () => {
    const db = await createTestDb();
    // Hash a random-looking string with a foreign prefix; even if its
    // hash collided with a real row (it won't), we'd refuse to look it
    // up. This protects against accidentally accepting a GitHub PAT
    // (`ghp_…`) that someone pastes into the wrong env var.
    const result = await validateApiToken(db, "ghp_aaaaaaaaaaaaaaaaaaaa");
    expect(result).toBeNull();
  });

  test("returns null after revocation", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { secret, row } = await createApiToken(db, {
      userId: user.id,
      name: "t",
      expiresAt: null,
    });

    await revokeApiToken(db, { id: row.id, userId: user.id });

    expect(await validateApiToken(db, secret)).toBeNull();
  });

  test("returns null for an expired token", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { secret } = await createApiToken(db, {
      userId: user.id,
      name: "t",
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await validateApiToken(db, secret)).toBeNull();
  });

  test("returns null for a disabled user", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { secret } = await createApiToken(db, {
      userId: user.id,
      name: "t",
      expiresAt: null,
    });

    await db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, user.id));

    expect(await validateApiToken(db, secret)).toBeNull();
  });
});

describe("revokeApiToken", () => {
  test("returns true when the row is revoked, false on cross-user attempts", async () => {
    const db = await createTestDb();
    const owner = await userFactory.transient({ db }).create({});
    const intruder = await userFactory.transient({ db }).create({});
    const { row } = await createApiToken(db, {
      userId: owner.id,
      name: "t",
      expiresAt: null,
    });

    // Cross-user attempt is a no-op (NOT_FOUND from the caller's pov).
    expect(await revokeApiToken(db, { id: row.id, userId: intruder.id })).toBe(
      false,
    );

    // Owner revokes successfully.
    expect(await revokeApiToken(db, { id: row.id, userId: owner.id })).toBe(
      true,
    );

    // Idempotent: a second call returns false because revokedAt is now set.
    expect(await revokeApiToken(db, { id: row.id, userId: owner.id })).toBe(
      false,
    );
  });
});
