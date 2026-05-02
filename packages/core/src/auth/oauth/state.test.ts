import { describe, expect, test } from "vitest";

import { eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { createTestDb } from "../../test/harness.js";
import { hashToken } from "../tokens.js";
import { consumeOAuthState, issueOAuthState } from "./state.js";

describe("oauth state store", () => {
  test("issues a base64url state and persists the hash, never the raw value", async () => {
    const db = await createTestDb();
    const { state, expiresAt } = await issueOAuthState(db, {
      provider: "github",
      codeVerifier: "v-1",
    });

    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const hash = await hashToken(state);
    const row = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, hash),
    });
    expect(row?.type).toBe("oauth_state");
    // Raw state must not appear in the row's primary key.
    const rawRow = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, state),
    });
    expect(rawRow).toBeUndefined();
  });

  test("consume returns the payload and deletes the row (single-use)", async () => {
    const db = await createTestDb();
    const { state } = await issueOAuthState(db, {
      provider: "google",
      codeVerifier: "abc",
    });

    const first = await consumeOAuthState(db, state);
    expect(first).toEqual({ provider: "google", codeVerifier: "abc" });

    const replay = await consumeOAuthState(db, state);
    expect(replay).toBeNull();
  });

  test("consume rejects an unknown state without throwing", async () => {
    const db = await createTestDb();
    expect(
      await consumeOAuthState(db, "definitely-not-a-real-token"),
    ).toBeNull();
  });

  test("consume rejects an expired state and removes the row", async () => {
    const db = await createTestDb();
    const { state } = await issueOAuthState(
      db,
      { provider: "github", codeVerifier: "v" },
      -1, // already expired
    );

    expect(await consumeOAuthState(db, state)).toBeNull();
    const hash = await hashToken(state);
    const row = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, hash),
    });
    expect(row).toBeUndefined();
  });

  test("consume ignores rows of a different type", async () => {
    const db = await createTestDb();
    const raw = "not-an-oauth-token";
    const hash = await hashToken(raw);
    // An invite-typed row stored under the same hash an oauth_state would
    // hash to — consumer must return null and leave the row alone.
    await db.insert(authTokens).values({
      hash,
      type: "invite",
      email: "x@y.z",
      role: "subscriber",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await consumeOAuthState(db, raw)).toBeNull();
    const row = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, hash),
    });
    expect(row?.type).toBe("invite");
  });
});
