import { describe, expect, test } from "vitest";

import { eq, sql } from "../db/index.js";
import { oauthAccounts } from "../db/schema/oauth_accounts.js";
import { users } from "../db/schema/users.js";
import {
  allowedDomainFactory,
  oauthAccountFactory,
  userFactory,
} from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import {
  ExternalIdentityError,
  extractDomain,
  resolveExternalIdentity,
} from "./identity.js";

describe("resolveExternalIdentity — sign-in (existing user)", () => {
  test("returns the existing user when verified", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });

    const result = await resolveExternalIdentity(db, {
      meta: {},
      email: "alice@example.com",
      emailVerified: true,
    });
    expect(result.user.id).toBe(seeded.id);
    expect(result.created).toBe(false);
  });

  test("rejects when emailVerified=false (takeover defense)", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });

    await expect(
      resolveExternalIdentity(db, {
        meta: {},
        email: "alice@example.com",
        emailVerified: false,
      }),
    ).rejects.toMatchObject({ code: "email_unverified" });
  });

  test("rejects when the existing user is disabled", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
      disabledAt: new Date(),
    });

    await expect(
      resolveExternalIdentity(db, {
        meta: {},
        email: "alice@example.com",
        emailVerified: true,
      }),
    ).rejects.toMatchObject({ code: "account_disabled" });
  });
});

describe("resolveExternalIdentity — signup (allowed-domains gate)", () => {
  test("provisions a new user with the domain's defaultRole", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "author",
      isEnabled: true,
    });

    const result = await resolveExternalIdentity(db, {
      meta: {},
      email: "newcomer@example.com",
      emailVerified: true,
    });
    expect(result.created).toBe(true);
    expect(result.user.email).toBe("newcomer@example.com");
    expect(result.user.role).toBe("author");
    expect(result.user.emailVerifiedAt).not.toBeNull();
  });

  test("rejects when the domain is disabled", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "author",
      isEnabled: false,
    });

    await expect(
      resolveExternalIdentity(db, {
        meta: {},
        email: "newcomer@example.com",
        emailVerified: true,
      }),
    ).rejects.toMatchObject({ code: "domain_not_allowed" });
  });

  test("rejects when no allowed-domains row exists for the email's domain", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });

    await expect(
      resolveExternalIdentity(db, {
        meta: {},
        email: "stranger@unknown.com",
        emailVerified: true,
      }),
    ).rejects.toMatchObject({ code: "domain_not_allowed" });
  });

  test("rejects when emailVerified=false (no provisioning without inbox proof)", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "author",
      isEnabled: true,
    });

    await expect(
      resolveExternalIdentity(db, {
        meta: {},
        email: "newcomer@example.com",
        emailVerified: false,
      }),
    ).rejects.toMatchObject({ code: "email_unverified" });
  });

  test("rejects with registration_closed when zero users (bootstrap rail)", async () => {
    const db = await createTestDb();
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "admin",
      isEnabled: true,
    });

    await expect(
      resolveExternalIdentity(db, {
        meta: {},
        email: "first@example.com",
        emailVerified: true,
      }),
    ).rejects.toMatchObject({ code: "registration_closed" });
  });
});

describe("resolveExternalIdentity — enterprise SSO (bypass allowed-domains)", () => {
  test("provisions with the explicit defaultRole, no allowed_domains lookup", async () => {
    // Enterprise SSO scenario: the IdP (e.g. CF Access fronting Okta)
    // already gates who can reach plumix. The allowed_domains
    // allowlist is irrelevant — caller passes the role from group
    // mapping directly.
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });

    const result = await resolveExternalIdentity(db, {
      meta: {},
      email: "engineer@enterprise.example",
      emailVerified: true,
      allowedDomainsGate: false,
      defaultRole: "editor",
    });
    expect(result.created).toBe(true);
    expect(result.user.role).toBe("editor");
  });

  test("requires defaultRole when allowedDomainsGate is false", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });

    await expect(
      resolveExternalIdentity(db, {
        meta: {},
        email: "x@y.example",
        emailVerified: true,
        allowedDomainsGate: false,
      }),
    ).rejects.toThrow(/defaultRole/);
  });

  test("bootstrapAllowed=true mints the first admin via this method", async () => {
    // Enterprise deploys that want SAML-only / CF-Access-only as the
    // first-admin path opt out of the passkey-only bootstrap rail.
    const db = await createTestDb();

    const result = await resolveExternalIdentity(db, {
      meta: {},
      email: "first-admin@enterprise.example",
      emailVerified: true,
      allowedDomainsGate: false,
      defaultRole: "subscriber",
      bootstrapAllowed: true,
    });
    expect(result.created).toBe(true);
    // provisionUser auto-promotes when users-table is empty.
    expect(result.user.role).toBe("admin");
  });
});

describe("resolveExternalIdentity — race retry", () => {
  test("two concurrent calls for the same new email both resolve to the same user", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "subscriber",
      isEnabled: true,
    });

    const [a, b] = await Promise.all([
      resolveExternalIdentity(db, {
        meta: {},
        email: "newcomer@example.com",
        emailVerified: true,
      }),
      resolveExternalIdentity(db, {
        meta: {},
        email: "newcomer@example.com",
        emailVerified: true,
      }),
    ]);
    expect(a.user.id).toBe(b.user.id);

    const rows = await db.query.users.findMany({
      where: eq(users.email, "newcomer@example.com"),
    });
    expect(rows).toHaveLength(1);
  });
});

describe("resolveExternalIdentity — error type", () => {
  test("rejects throw `ExternalIdentityError` instances", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });

    await expect(
      resolveExternalIdentity(db, {
        meta: {},
        email: "alice@example.com",
        emailVerified: false,
      }),
    ).rejects.toBeInstanceOf(ExternalIdentityError);
  });
});

describe("resolveExternalIdentity — provider account", () => {
  const github = { provider: "github", accountId: "gh-123" };

  test("a link whose user row is gone is refused as link_broken", async () => {
    const db = await createTestDb();
    // A row the cascade should have deleted but didn't; FKs are off only long
    // enough to insert the dangling reference.
    await db.run(sql`PRAGMA foreign_keys = OFF`);
    await oauthAccountFactory.transient({ db }).create({
      provider: "github",
      providerAccountId: "gh-123",
      userId: 9999,
    });
    await db.run(sql`PRAGMA foreign_keys = ON`);

    await expect(
      resolveExternalIdentity(db, {
        meta: {},
        email: "alice@example.com",
        emailVerified: true,
        providerAccount: github,
      }),
    ).rejects.toMatchObject({ code: "link_broken" });
  });

  test("an existing link wins over the email, even an unverified one", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });
    await oauthAccountFactory.transient({ db }).create({
      provider: "github",
      providerAccountId: "gh-123",
      userId: seeded.id,
    });

    const result = await resolveExternalIdentity(db, {
      meta: {},
      email: "renamed@elsewhere.example",
      emailVerified: false,
      providerAccount: github,
    });
    expect(result).toMatchObject({ created: false, user: { id: seeded.id } });
  });

  test("a link signs in the user it belongs to, not the first user", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ email: "alice@example.com" });
    const bob = await userFactory.transient({ db }).create({
      email: "bob@example.com",
    });
    await oauthAccountFactory.transient({ db }).create({
      provider: "github",
      providerAccountId: "gh-123",
      userId: bob.id,
    });

    const result = await resolveExternalIdentity(db, {
      meta: {},
      email: "bob@example.com",
      emailVerified: true,
      providerAccount: github,
    });

    expect(result.user.email).toBe("bob@example.com");
  });

  test("a link to a disabled user is refused as account_disabled", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: "alice@example.com",
      disabledAt: new Date(),
    });
    await oauthAccountFactory.transient({ db }).create({
      provider: "github",
      providerAccountId: "gh-123",
      userId: seeded.id,
    });

    await expect(
      resolveExternalIdentity(db, {
        meta: {},
        email: "alice@example.com",
        emailVerified: true,
        providerAccount: github,
      }),
    ).rejects.toMatchObject({ code: "account_disabled" });
  });

  test("a verified email match links the account to the existing user", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "author",
    });

    await resolveExternalIdentity(db, {
      meta: {},
      email: "alice@example.com",
      emailVerified: true,
      providerAccount: github,
    });

    const link = await db.query.oauthAccounts.findFirst({
      where: eq(oauthAccounts.providerAccountId, "gh-123"),
    });
    expect(link).toMatchObject({ provider: "github", userId: seeded.id });
  });

  test("a new user is linked and takes the profile", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "contributor",
      isEnabled: true,
    });

    const result = await resolveExternalIdentity(db, {
      meta: {},
      email: "alice@example.com",
      emailVerified: true,
      name: "Alice",
      avatarUrl: "https://example.com/a.png",
      providerAccount: github,
    });

    expect(result.created).toBe(true);
    expect(result.user).toMatchObject({
      name: "Alice",
      avatarUrl: "https://example.com/a.png",
      role: "contributor",
    });
    const link = await db.query.oauthAccounts.findFirst({
      where: eq(oauthAccounts.providerAccountId, "gh-123"),
    });
    expect(link?.userId).toBe(result.user.id);
  });

  test("two sign-ins for one new email with different accounts share one user", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "subscriber",
      isEnabled: true,
    });

    const [a, b] = await Promise.all([
      resolveExternalIdentity(db, {
        meta: {},
        email: "alice@example.com",
        emailVerified: true,
        providerAccount: { provider: "github", accountId: "race-1" },
      }),
      resolveExternalIdentity(db, {
        meta: {},
        email: "alice@example.com",
        emailVerified: true,
        providerAccount: { provider: "github", accountId: "race-2" },
      }),
    ]);

    expect(a.user.id).toBe(b.user.id);
    const links = await db.query.oauthAccounts.findMany({
      where: eq(oauthAccounts.userId, a.user.id),
    });
    expect(links).toHaveLength(2);
  });

  test("a sign-up that loses the link race still reports the user it created", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "subscriber",
      isEnabled: true,
    });
    // A concurrent sign-in finds alice by email the moment her row exists and
    // links the account before this sign-up's own link insert runs.
    await db.run(sql`
      CREATE TRIGGER concurrent_link AFTER INSERT ON users
      WHEN NEW.email = 'alice@example.com'
      BEGIN
        INSERT INTO oauth_accounts (provider, provider_account_id, user_id)
        VALUES ('github', 'gh-123', NEW.id);
      END
    `);

    const result = await resolveExternalIdentity(db, {
      meta: {},
      email: "alice@example.com",
      emailVerified: true,
      providerAccount: github,
    });

    expect(result).toMatchObject({
      created: true,
      user: { email: "alice@example.com" },
    });
  });

  test("a link insert that fails for another reason fails the sign-in", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ email: "alice@example.com" });
    await db.run(sql`
      CREATE TRIGGER refuse_links BEFORE INSERT ON oauth_accounts
      BEGIN SELECT RAISE(ABORT, 'link storage unavailable'); END
    `);

    const signIn = resolveExternalIdentity(db, {
      meta: {},
      email: "alice@example.com",
      emailVerified: true,
      providerAccount: github,
    });

    // Drizzle's own frame says only "Failed query"; the cause carries why.
    await expect(signIn).rejects.toHaveProperty(
      "cause.message",
      expect.stringContaining("link storage unavailable"),
    );
  });
});

describe("extractDomain", () => {
  test("returns the lowercased domain part", () => {
    expect(extractDomain("alice@Example.COM")).toBe("example.com");
  });

  test("handles addr-spec with subdomain", () => {
    expect(extractDomain("a@mail.example.com")).toBe("mail.example.com");
  });

  test("returns null when the local part is empty", () => {
    // Defense-in-depth — without this, `@evil.example` would leak
    // through to the allowed_domains lookup as the bare domain string.
    expect(extractDomain("@example.com")).toBeNull();
  });

  test("returns null when the domain part is empty", () => {
    expect(extractDomain("alice@")).toBeNull();
  });

  test("returns null when no @ is present", () => {
    expect(extractDomain("not-an-email")).toBeNull();
  });

  test("returns null on empty string", () => {
    expect(extractDomain("")).toBeNull();
  });
});
