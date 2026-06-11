import { describe, expect, test } from "vitest";

import { validateApiToken } from "../auth/api-tokens.js";
import { hashToken } from "../auth/tokens.js";
import {
  apiTokenFactory,
  authTokenFactory,
  oauthAccountFactory,
  userFactory,
} from "./factories.js";
import { createTestDb } from "./harness.js";

describe("oauthAccountFactory", () => {
  test("links an oauth account to a user", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});

    const row = await oauthAccountFactory.transient({ db }).create({
      userId: user.id,
      provider: "github",
      providerAccountId: "gh-1",
    });

    expect(row.userId).toBe(user.id);
    expect(row.provider).toBe("github");
    expect(row.providerAccountId).toBe("gh-1");
  });
});

describe("apiTokenFactory", () => {
  test("mints a PAT whose secret validates against the stored hash", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({ role: "editor" });

    const minted = await apiTokenFactory
      .transient({ db })
      .create({ userId: user.id, scopes: ["entry:post:read"] });

    expect(minted.secret).toMatch(/^pl_pat_/);
    const validated = await validateApiToken(db, minted.secret);
    expect(validated?.user.id).toBe(user.id);
    expect(validated?.token.scopes).toEqual(["entry:post:read"]);
  });
});

describe("authTokenFactory", () => {
  test("mints a real token whose stored hash matches", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});

    const minted = await authTokenFactory.transient({ db }).create({
      type: "magic_link",
      userId: user.id,
      email: user.email,
    });

    expect(minted.token).toMatch(/^[\w-]+$/);
    expect(minted.row.hash).toBe(await hashToken(minted.token));
    expect(minted.row.type).toBe("magic_link");
    expect(minted.row.userId).toBe(user.id);
  });

  test("honours an explicit type and expiry", async () => {
    const db = await createTestDb();
    const expiresAt = new Date(Date.now() + 1000);

    const minted = await authTokenFactory
      .transient({ db })
      .create({ type: "invite", role: "editor", expiresAt });

    expect(minted.row.type).toBe("invite");
    expect(minted.row.role).toBe("editor");
    // auth_tokens.expiresAt stores Unix seconds, so compare at that precision.
    expect(Math.floor(minted.row.expiresAt.getTime() / 1000)).toBe(
      Math.floor(expiresAt.getTime() / 1000),
    );
  });
});
