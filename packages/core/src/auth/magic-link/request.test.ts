import { describe, expect, test, vi } from "vitest";

import type { Mailer } from "../mailer/types.js";
import { eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import {
  allowedDomainFactory,
  authTokenFactory,
  userFactory,
} from "../../test/factories.js";
import { createTestDb } from "../../test/harness.js";
import { hashToken } from "../tokens.js";
import { requestMagicLink } from "./request.js";

interface CapturedSend {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

function captureMailer(): { mailer: Mailer; sent: CapturedSend[] } {
  const sent: CapturedSend[] = [];
  return {
    sent,
    mailer: {
      send(message) {
        sent.push({ ...message });
        return Promise.resolve();
      },
    },
  };
}

describe("requestMagicLink", () => {
  test("issues a token + sends email when the user exists", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "alice@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test Site",
    });

    expect(sent).toHaveLength(1);
    const [message] = sent;
    expect(message?.to).toBe("alice@example.com");
    expect(message?.subject).toContain("Test Site");
    expect(message?.text).toContain(
      "https://cms.example/_plumix/auth/magic-link/verify?token=",
    );
    // Plumix doesn't ship HTML — operators template in their own mailer
    // wrapper if they want it. The text body alone is the contract.
    expect(message?.html).toBeUndefined();

    // The DB row exists, keyed by SHA-256(token), pointing at the user.
    // Recover the token from the URL and verify hash storage.
    const tokenMatch = /token=([A-Za-z0-9_-]+)/.exec(message?.text ?? "");
    const tokenInUrl = tokenMatch?.[1];
    if (!tokenInUrl) throw new Error("expected token in email URL");
    const hash = await hashToken(tokenInUrl);
    const row = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, hash),
    });
    expect(row?.type).toBe("magic_link");
    expect(row?.userId).toBe(user.id);
    expect(row?.email).toBe("alice@example.com");
  });

  test("silently no-ops when the email is unregistered", async () => {
    const db = await createTestDb();
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "stranger@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
    });

    expect(sent).toHaveLength(0);
    const all = await db.select().from(authTokens);
    expect(all).toHaveLength(0);
  });

  test("silently no-ops when the user is disabled", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: "blocked@example.com",
      role: "editor",
      disabledAt: new Date(),
    });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "blocked@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
    });

    expect(sent).toHaveLength(0);
  });

  test("normalises email to lowercase before lookup", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "  Alice@Example.com  ",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
    });

    expect(sent).toHaveLength(1);
  });

  test("signup: allowed domain → token issued with userId=null + email sent", async () => {
    const db = await createTestDb();
    // Need at least one user so the bootstrap rail is satisfied.
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "subscriber",
      isEnabled: true,
    });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "newcomer@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
    });

    expect(sent).toHaveLength(1);
    const tokenMatch = /token=([A-Za-z0-9_-]+)/.exec(sent[0]?.text ?? "");
    const tokenInUrl = tokenMatch?.[1];
    if (!tokenInUrl) throw new Error("expected token in email URL");
    const hash = await hashToken(tokenInUrl);
    const row = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, hash),
    });
    expect(row?.type).toBe("magic_link");
    expect(row?.userId).toBeNull();
    expect(row?.email).toBe("newcomer@example.com");
  });

  test("signup: disabled allowed-domains row silently no-ops", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "subscriber",
      isEnabled: false,
    });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "newcomer@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
    });

    expect(sent).toHaveLength(0);
    const tokens = await db.select().from(authTokens);
    expect(tokens).toHaveLength(0);
  });

  test("signup: missing allowed-domains row silently no-ops", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "stranger@unknown.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
    });

    expect(sent).toHaveLength(0);
  });

  test("signup: zero-user system refuses signup (bootstrap is passkey-only)", async () => {
    const db = await createTestDb();
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "admin",
      isEnabled: true,
    });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "first@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
    });

    expect(sent).toHaveLength(0);
    const tokens = await db.select().from(authTokens);
    expect(tokens).toHaveLength(0);
  });

  test("signup: bootstrapAllowed=true issues a token even with zero users", async () => {
    const db = await createTestDb();
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "subscriber",
      isEnabled: true,
    });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "first@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
      bootstrapAllowed: true,
    });

    expect(sent).toHaveLength(1);
    const tokens = await db.select().from(authTokens);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.email).toBe("first@example.com");
    expect(tokens[0]?.userId).toBeNull();
  });

  test("selfSignupOpen: unlisted domain → token issued for a new email", async () => {
    const db = await createTestDb();
    // One existing user satisfies the bootstrap rail; no allowed_domains
    // row for this domain — domain-gated signup would no-op, but open
    // self-signup issues the token.
    await userFactory.transient({ db }).create({ role: "admin" });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "stranger@anywhere.test",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
      selfSignupOpen: true,
    });

    expect(sent).toHaveLength(1);
    const tokens = await db.select().from(authTokens);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.userId).toBeNull();
    expect(tokens[0]?.email).toBe("stranger@anywhere.test");
  });

  test("selfSignupOpen: zero-user system still refuses (bootstrap rail holds)", async () => {
    const db = await createTestDb();
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "first@anywhere.test",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
      selfSignupOpen: true,
    });

    expect(sent).toHaveLength(0);
    const tokens = await db.select().from(authTokens);
    expect(tokens).toHaveLength(0);
  });

  test("selfSignupOpen: malformed email (no domain) silently no-ops", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "not-an-email",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
      selfSignupOpen: true,
    });

    expect(sent).toHaveLength(0);
  });

  test("swallows mailer errors so the response shape never leaks success", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });
    const mailer: Mailer = {
      send: vi.fn().mockRejectedValue(new Error("smtp down")),
    };

    await expect(
      requestMagicLink(db, {
        email: "alice@example.com",
        origin: "https://cms.example",
        basePath: "",
        mailer,
        siteName: "Test",
      }),
    ).resolves.toBeUndefined();
  });

  test("renders the email body in the recipient's locale when supplied", async () => {
    // Pre-auth flow: the caller (routes.ts) supplies the resolved
    // admin-shell locale. With "de", subject + body should be German.
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: "klaus@example.com",
      role: "editor",
    });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "klaus@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test Site",
      locale: "de",
    });

    const [message] = sent;
    expect(message?.subject).toBe("Bei Test Site anmelden");
    expect(message?.text).toContain("Melden Sie sich bei Test Site");
  });

  test("falls back to English when locale is omitted or unknown", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: "fallback@example.com",
      role: "editor",
    });
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "fallback@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test Site",
      locale: "xx-INVALID",
    });

    const [message] = sent;
    expect(message?.subject).toBe("Sign in to Test Site");
  });
});

describe("requestMagicLink — per-email issuance cap", () => {
  // Seed `count` recent magic-link tokens for `email` so the next request
  // sits at or past the cap.
  async function seedRecentTokens(
    db: Awaited<ReturnType<typeof createTestDb>>,
    email: string,
    count: number,
  ): Promise<void> {
    for (let i = 0; i < count; i++) {
      await authTokenFactory
        .transient({ db })
        .create({ type: "magic_link", email });
    }
  }

  test("stops issuing once an email hits the cap within the window", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });
    // Five live tokens already issued to this address this window.
    await seedRecentTokens(db, "alice@example.com", 5);
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "alice@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
    });

    // Over the cap → silent no-op, no sixth token minted.
    expect(sent).toHaveLength(0);
    const rows = await db.select().from(authTokens);
    expect(rows).toHaveLength(5);
  });

  test("still issues while below the cap", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });
    await seedRecentTokens(db, "alice@example.com", 4);
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "alice@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
    });

    expect(sent).toHaveLength(1);
    const rows = await db.select().from(authTokens);
    expect(rows).toHaveLength(5);
  });

  test("the cap is per-email — a flooded address never blocks another", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });
    // Bob is flooded; Alice's request must still go through.
    await seedRecentTokens(db, "bob@example.com", 5);
    const { mailer, sent } = captureMailer();

    await requestMagicLink(db, {
      email: "alice@example.com",
      origin: "https://cms.example",
      basePath: "",
      mailer,
      siteName: "Test",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("alice@example.com");
  });
});
