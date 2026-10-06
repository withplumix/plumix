import { describe, expect, test, vi } from "vitest";

import { validateApiToken } from "../auth/api-tokens.js";
import { hashToken } from "../auth/tokens.js";
import {
  apiTokenFactory,
  authTokenFactory,
  deviceCodeFactory,
  oauthAccountFactory,
  userFactory,
} from "./factories.js";
import { createTestDb } from "./harness.js";

// Each Playwright worker loads its own module graph, so each one's factory
// sequences start over at 1 while every worker seeds the same database.
async function loadInFreshProcess() {
  vi.resetModules();
  return import("./factories.js");
}

type FactoriesModule = Awaited<ReturnType<typeof loadInFreshProcess>>;
type Db = Awaited<ReturnType<typeof createTestDb>>;

describe("defaults on unique columns", () => {
  const cases: readonly [
    string,
    (f: FactoriesModule, db: Db, userId: number) => Promise<unknown>,
  ][] = [
    ["userFactory", (f, db) => f.userFactory.transient({ db }).create({})],
    [
      "entryFactory",
      (f, db, userId) =>
        f.entryFactory.transient({ db }).create({ authorId: userId }),
    ],
    ["termFactory", (f, db) => f.termFactory.transient({ db }).create({})],
    [
      "sessionFactory",
      (f, db, userId) => f.sessionFactory.transient({ db }).create({ userId }),
    ],
    [
      "settingFactory",
      (f, db) => f.settingFactory.transient({ db }).create({}),
    ],
    [
      "allowedDomainFactory",
      (f, db) => f.allowedDomainFactory.transient({ db }).create({}),
    ],
    [
      "credentialFactory",
      (f, db, userId) =>
        f.credentialFactory
          .transient({ db })
          .create({ userId, publicKey: Buffer.from([1, 2, 3]) }),
    ],
    [
      "oauthAccountFactory",
      (f, db, userId) =>
        f.oauthAccountFactory.transient({ db }).create({ userId }),
    ],
    [
      "deviceCodeFactory",
      (f, db) => f.deviceCodeFactory.transient({ db }).create({}),
    ],
  ];

  test.each(cases)(
    "%s: a second process seeding the same db does not collide",
    async (_name, create) => {
      const db = await createTestDb();
      const user = await userFactory
        .transient({ db })
        .create({ email: "owner@example.test", slug: "owner" });

      await create(await loadInFreshProcess(), db, user.id);

      await expect(
        create(await loadInFreshProcess(), db, user.id),
      ).resolves.toBeDefined();
    },
  );
});

describe("userFactory", () => {
  test("uses an explicit email and slug verbatim", async () => {
    const db = await createTestDb();

    const user = await userFactory
      .transient({ db })
      .create({ email: "ada@example.test", slug: "ada" });

    expect(user.email).toBe("ada@example.test");
    expect(user.slug).toBe("ada");
  });
});

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

describe("deviceCodeFactory", () => {
  test("mints a device code whose secret hashes to the stored row id", async () => {
    const db = await createTestDb();

    const minted = await deviceCodeFactory.transient({ db }).create({});

    expect(minted.row.id).toBe(await hashToken(minted.deviceCode));
    expect(minted.row.status).toBe("pending");
    expect(minted.row.userCode).toBe(minted.userCode);
  });

  test("defaults to an RFC 8628 ABCD-EFGH user code", async () => {
    const db = await createTestDb();

    const minted = await deviceCodeFactory.transient({ db }).create({});

    expect(minted.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
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
