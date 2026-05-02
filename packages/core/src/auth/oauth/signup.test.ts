import { describe, expect, test } from "vitest";

import { eq } from "../../db/index.js";
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
