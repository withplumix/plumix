import { afterEach, describe, expect, test, vi } from "vitest";

import { validateApiToken } from "../auth/api-tokens.js";
import { hashToken } from "../auth/tokens.js";
import {
  apiTokenFactory,
  authTokenFactory,
  deviceCodeFactory,
  oauthAccountFactory,
  userFactory,
} from "./factories.js";
import * as thisProcess from "./factories.js";
import { createTestDb } from "./harness.js";

// A second Playwright worker is a second process: its factory sequences start
// over at 1, and it loads its own copy of the factories module.
async function loadSecondProcess() {
  vi.resetModules();
  return import("./factories.js");
}

type FactoriesModule = Awaited<ReturnType<typeof loadSecondProcess>>;
type Db = Awaited<ReturnType<typeof createTestDb>>;

describe("defaults on unique columns", () => {
  interface Case {
    readonly name: string;
    readonly rewind: (f: FactoriesModule) => void;
    readonly create: (
      f: FactoriesModule,
      db: Db,
      userId: number,
    ) => Promise<unknown>;
  }

  const cases: readonly Case[] = [
    {
      name: "userFactory",
      rewind: (f) => f.userFactory.rewindSequence(),
      create: (f, db) => f.userFactory.transient({ db }).create({}),
    },
    {
      name: "entryFactory",
      rewind: (f) => f.entryFactory.rewindSequence(),
      create: (f, db, userId) =>
        f.entryFactory.transient({ db }).create({ authorId: userId }),
    },
    {
      name: "termFactory",
      rewind: (f) => f.termFactory.rewindSequence(),
      create: (f, db) => f.termFactory.transient({ db }).create({}),
    },
    {
      name: "sessionFactory",
      rewind: (f) => f.sessionFactory.rewindSequence(),
      create: (f, db, userId) =>
        f.sessionFactory.transient({ db }).create({ userId }),
    },
    {
      name: "settingFactory",
      rewind: (f) => f.settingFactory.rewindSequence(),
      create: (f, db) => f.settingFactory.transient({ db }).create({}),
    },
    {
      name: "allowedDomainFactory",
      rewind: (f) => f.allowedDomainFactory.rewindSequence(),
      create: (f, db) => f.allowedDomainFactory.transient({ db }).create({}),
    },
    {
      name: "credentialFactory",
      rewind: (f) => f.credentialFactory.rewindSequence(),
      create: (f, db, userId) =>
        f.credentialFactory
          .transient({ db })
          .create({ userId, publicKey: Buffer.from([1, 2, 3]) }),
    },
    {
      name: "oauthAccountFactory",
      rewind: (f) => f.oauthAccountFactory.rewindSequence(),
      create: (f, db, userId) =>
        f.oauthAccountFactory.transient({ db }).create({ userId }),
    },
    {
      name: "deviceCodeFactory",
      rewind: (f) => f.deviceCodeFactory.rewindSequence(),
      create: (f, db) => f.deviceCodeFactory.transient({ db }).create({}),
    },
  ];

  afterEach(() => {
    vi.useRealTimers();
  });

  test.each(cases)(
    "$name: a second process seeding the same db does not collide",
    async ({ rewind, create }) => {
      // Two workers can create in the same millisecond, so a clock-derived
      // suffix is no guarantee. Freeze the clock to make that the case here.
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-01-01") });
      const db = await createTestDb();
      const user = await userFactory
        .transient({ db })
        .create({ email: "owner@example.test", slug: "owner" });

      rewind(thisProcess);
      await create(thisProcess, db, user.id);

      await expect(
        create(await loadSecondProcess(), db, user.id),
      ).resolves.toBeDefined();
    },
  );
});

describe("explicit values on unique columns", () => {
  const cases: readonly {
    readonly name: string;
    readonly create: (db: Db, userId: number) => Promise<unknown>;
    readonly expected: Record<string, string>;
  }[] = [
    {
      name: "userFactory",
      create: (db) =>
        userFactory
          .transient({ db })
          .create({ email: "ada@example.test", slug: "ada" }),
      expected: { email: "ada@example.test", slug: "ada" },
    },
    {
      name: "entryFactory",
      create: (db, userId) =>
        thisProcess.entryFactory
          .transient({ db })
          .create({ authorId: userId, slug: "hello" }),
      expected: { slug: "hello" },
    },
    {
      name: "termFactory",
      create: (db) =>
        thisProcess.termFactory.transient({ db }).create({ slug: "news" }),
      expected: { slug: "news" },
    },
    {
      name: "sessionFactory",
      create: (db, userId) =>
        thisProcess.sessionFactory
          .transient({ db })
          .create({ userId, id: "session-a" }),
      expected: { id: "session-a" },
    },
    {
      name: "settingFactory",
      create: (db) =>
        thisProcess.settingFactory
          .transient({ db })
          .create({ group: "site", key: "title" }),
      expected: { group: "site", key: "title" },
    },
    {
      name: "allowedDomainFactory",
      create: (db) =>
        thisProcess.allowedDomainFactory
          .transient({ db })
          .create({ domain: "school.test" }),
      expected: { domain: "school.test" },
    },
    {
      name: "credentialFactory",
      create: (db, userId) =>
        thisProcess.credentialFactory.transient({ db }).create({
          userId,
          id: "cred-a",
          publicKey: Buffer.from([1, 2, 3]),
        }),
      expected: { id: "cred-a" },
    },
    {
      name: "oauthAccountFactory",
      create: (db, userId) =>
        oauthAccountFactory
          .transient({ db })
          .create({ userId, providerAccountId: "gh-1" }),
      expected: { providerAccountId: "gh-1" },
    },
  ];

  test.each(cases)("$name uses them verbatim", async ({ create, expected }) => {
    const db = await createTestDb();
    const owner = await userFactory
      .transient({ db })
      .create({ email: "owner@example.test", slug: "owner" });

    const row = await create(db, owner.id);

    expect(row).toMatchObject(expected);
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

  test("uses an explicit user code verbatim", async () => {
    const db = await createTestDb();

    const minted = await deviceCodeFactory
      .transient({ db })
      .create({ userCode: "WXYZ-9876" });

    expect(minted.userCode).toBe("WXYZ-9876");
  });

  test("derives the default user code from the process token and the sequence", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "abcd1234-0000-4000-8000-000000000000",
    );
    const { deviceCodeFactory: freshFactory } = await loadSecondProcess();
    vi.restoreAllMocks();
    const db = await createTestDb();

    const first = await freshFactory.transient({ db }).create({});
    const second = await freshFactory.transient({ db }).create({});

    expect(first.userCode).toBe("ABCD-0001");
    expect(second.userCode).toBe("ABCD-0002");
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
