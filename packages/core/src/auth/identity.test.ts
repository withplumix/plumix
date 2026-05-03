import { describe, expect, test } from "vitest";

import { eq } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { allowedDomainFactory, userFactory } from "../test/factories.js";
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
        email: "newcomer@example.com",
        emailVerified: true,
      }),
      resolveExternalIdentity(db, {
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
        email: "alice@example.com",
        emailVerified: false,
      }),
    ).rejects.toBeInstanceOf(ExternalIdentityError);
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
