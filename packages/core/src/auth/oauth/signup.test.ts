import { describe, expect, test } from "vitest";

import { eq, sql } from "../../db/index.js";
import { allowedDomains } from "../../db/schema/allowed_domains.js";
import { oauthAccounts } from "../../db/schema/oauth_accounts.js";
import { users } from "../../db/schema/users.js";
import { allowedDomainFactory, userFactory } from "../../test/factories.js";
import { createTestDb } from "../../test/harness.js";
import { OAuthError } from "./errors.js";
import { resolveOAuthUser } from "./signup.js";

const PROFILE = {
  providerAccountId: "gh-123",
  email: "alice@example.com",
  emailVerified: true,
  name: "Alice",
  avatarUrl: "https://example.com/a.png",
} as const;

describe("resolveOAuthUser — dangling oauth_accounts row", () => {
  test("missing user behind an oauth_accounts row throws link_broken", async () => {
    const db = await createTestDb();
    // SQLite enforces FKs in our test harness; produce a dangling row by
    // disabling enforcement just long enough to insert a forward-reference
    // to a userId that doesn't exist. Mirrors the production-data shape we
    // care about: a row that the cascade should have deleted but didn't.
    await db.run(sql`PRAGMA foreign_keys = OFF`);
    await db.insert(oauthAccounts).values({
      provider: "github",
      providerAccountId: "ghost-1",
      userId: 9999,
    });
    await db.run(sql`PRAGMA foreign_keys = ON`);

    await expect(
      resolveOAuthUser(db, {
        provider: "github",
        profile: { ...PROFILE, providerAccountId: "ghost-1" },
      }),
    ).rejects.toMatchObject({ code: "link_broken" });
  });
});

describe("resolveOAuthUser — link existing oauth account", () => {
  test("returns the linked user without creating anything", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: PROFILE.email,
      role: "editor",
    });
    await db.insert(oauthAccounts).values({
      provider: "github",
      providerAccountId: PROFILE.providerAccountId,
      userId: seeded.id,
    });

    const result = await resolveOAuthUser(db, {
      provider: "github",
      profile: PROFILE,
    });
    expect(result.user.id).toBe(seeded.id);
    expect(result.created).toBe(false);
    expect(result.linked).toBe(false);
  });

  test("rejects when the linked user is disabled", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: PROFILE.email,
      role: "editor",
      disabledAt: new Date(),
    });
    await db.insert(oauthAccounts).values({
      provider: "github",
      providerAccountId: PROFILE.providerAccountId,
      userId: seeded.id,
    });

    await expect(
      resolveOAuthUser(db, { provider: "github", profile: PROFILE }),
    ).rejects.toMatchObject({ code: "account_disabled" });
  });
});

describe("resolveOAuthUser — link by email (existing user, no oauth row)", () => {
  test("verified-email match writes the oauth_accounts row and returns the user", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: PROFILE.email,
      role: "author",
    });

    const result = await resolveOAuthUser(db, {
      provider: "github",
      profile: PROFILE,
    });
    expect(result.user.id).toBe(seeded.id);
    expect(result.linked).toBe(true);
    expect(result.created).toBe(false);

    const link = await db.query.oauthAccounts.findFirst({
      where: eq(oauthAccounts.providerAccountId, PROFILE.providerAccountId),
    });
    expect(link?.userId).toBe(seeded.id);
  });

  test("unverified email is refused (no link, no signup)", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: PROFILE.email,
      role: "author",
    });

    await expect(
      resolveOAuthUser(db, {
        provider: "github",
        profile: { ...PROFILE, emailVerified: false },
      }),
    ).rejects.toMatchObject({ code: "email_unverified" });
  });

  test("rejects when the existing user is disabled", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: PROFILE.email,
      role: "author",
      disabledAt: new Date(),
    });
    await expect(
      resolveOAuthUser(db, { provider: "github", profile: PROFILE }),
    ).rejects.toMatchObject({ code: "account_disabled" });
  });
});

describe("resolveOAuthUser — domain-gated signup", () => {
  test("allowed + enabled domain provisions a new user with the domain's role", async () => {
    const db = await createTestDb();
    // System needs at least one user so we never bootstrap an admin via OAuth.
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "contributor",
      isEnabled: true,
    });

    const result = await resolveOAuthUser(db, {
      provider: "github",
      profile: PROFILE,
    });

    expect(result.created).toBe(true);
    expect(result.user.email).toBe(PROFILE.email);
    expect(result.user.role).toBe("contributor");
    expect(result.user.emailVerifiedAt).not.toBeNull();

    const link = await db.query.oauthAccounts.findFirst({
      where: eq(oauthAccounts.providerAccountId, PROFILE.providerAccountId),
    });
    expect(link?.userId).toBe(result.user.id);
  });

  test("disabled domain row rejects with domain_not_allowed", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await db.insert(allowedDomains).values({
      domain: "example.com",
      defaultRole: "contributor",
      isEnabled: false,
    });
    await expect(
      resolveOAuthUser(db, { provider: "github", profile: PROFILE }),
    ).rejects.toMatchObject({ code: "domain_not_allowed" });
  });

  test("missing domain row rejects with domain_not_allowed", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await expect(
      resolveOAuthUser(db, { provider: "github", profile: PROFILE }),
    ).rejects.toMatchObject({ code: "domain_not_allowed" });
  });

  test("unverified email blocks signup even when domain is allowed", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "contributor",
      isEnabled: true,
    });
    await expect(
      resolveOAuthUser(db, {
        provider: "github",
        profile: { ...PROFILE, emailVerified: false },
      }),
    ).rejects.toMatchObject({ code: "email_unverified" });
  });

  test("zero-user system refuses OAuth signup so bootstrap stays passkey-only", async () => {
    const db = await createTestDb();
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "admin",
      isEnabled: true,
    });
    await expect(
      resolveOAuthUser(db, { provider: "github", profile: PROFILE }),
    ).rejects.toMatchObject({ code: "registration_closed" });
    expect(await db.$count(users)).toBe(0);
  });
});

describe("resolveOAuthUser — error type", () => {
  test("throws OAuthError instances for all reject paths", async () => {
    const db = await createTestDb();
    await expect(
      resolveOAuthUser(db, {
        provider: "github",
        profile: { ...PROFILE, emailVerified: false },
      }),
    ).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("resolveOAuthUser — race on concurrent inserts", () => {
  test("two callbacks for the same new email both resolve without throwing 500", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "subscriber",
      isEnabled: true,
    });

    const [a, b] = await Promise.all([
      resolveOAuthUser(db, {
        provider: "github",
        profile: { ...PROFILE, providerAccountId: "race-1" },
      }),
      resolveOAuthUser(db, {
        provider: "github",
        // Identical email but a *different* providerAccountId — both
        // would normally try to insert a new user row keyed by that
        // email. The unique-constraint retry pattern lets the loser
        // fall through to the email-link branch on attempt #2.
        profile: { ...PROFILE, providerAccountId: "race-2" },
      }),
    ]);

    // Both calls return the same user (one created it, the other linked).
    expect(a.user.id).toBe(b.user.id);
    expect(a.user.email).toBe(PROFILE.email);
    // Exactly one user row, two oauth_accounts rows.
    const usersForEmail = await db.query.users.findMany({
      where: eq(users.email, PROFILE.email),
    });
    expect(usersForEmail).toHaveLength(1);
    const userId = usersForEmail[0]?.id;
    if (userId === undefined) throw new Error("user not created");
    const linksForUser = await db.query.oauthAccounts.findMany({
      where: eq(oauthAccounts.userId, userId),
    });
    expect(linksForUser).toHaveLength(2);
  });

  test("two callbacks for the same provider account map to the same user", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: PROFILE.email,
      role: "editor",
    });

    const [a, b] = await Promise.all([
      resolveOAuthUser(db, { provider: "github", profile: PROFILE }),
      resolveOAuthUser(db, { provider: "github", profile: PROFILE }),
    ]);

    expect(a.user.id).toBe(seeded.id);
    expect(b.user.id).toBe(seeded.id);
    // Composite PK on (provider, providerAccountId) means the second
    // insert raced — exactly one row must exist.
    const links = await db.query.oauthAccounts.findMany({
      where: eq(oauthAccounts.providerAccountId, PROFILE.providerAccountId),
    });
    expect(links).toHaveLength(1);
  });
});
