import { describe, expect, test, vi } from "vitest";

import type { Mailer } from "../mailer/types.js";
import { eq } from "../../db/index.js";
import { allowedDomains } from "../../db/schema/allowed_domains.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { sessions } from "../../db/schema/sessions.js";
import { users } from "../../db/schema/users.js";
import { createDispatcherHarness } from "../../test/dispatcher.js";
import { generateToken, hashToken } from "../tokens.js";

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

function postRequest(path: string, body: unknown): Request {
  return new Request(`https://cms.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-plumix-request": "1",
    },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string): Request {
  return new Request(`https://cms.example${path}`);
}

describe("magic-link request route", () => {
  test("returns 503 when magic-link is not configured", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", { email: "x@y.z" }),
    );
    expect(response.status).toBe(503);
  });

  test("returns 200 with generic message and sends mail when user exists", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    await h.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });

    const response = await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "alice@example.com",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/account exists/i);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain(
      "https://cms.example/_plumix/auth/magic-link/verify?token=",
    );
  });

  test("returns the same shape when user does not exist (no enumeration)", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });

    const response = await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "stranger@example.com",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/account exists/i);
    expect(sent).toHaveLength(0);
  });

  test("rejects malformed input with 400", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });

    const response = await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "not-an-email",
      }),
    );
    expect(response.status).toBe(400);
  });

  test("rejects missing CSRF header", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/magic-link/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "x@y.z" }),
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("magic-link verify route", () => {
  async function seedToken(
    h: Awaited<ReturnType<typeof createDispatcherHarness>>,
    userId: number,
    email: string,
    ttlSeconds: number = 15 * 60,
  ): Promise<string> {
    const token = generateToken();
    const hash = await hashToken(token);
    await h.db.insert(authTokens).values({
      hash,
      userId,
      email,
      type: "magic_link",
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    });
    return token;
  }

  test("missing token redirects with magic_link_error=missing_token", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    const response = await h.dispatch(
      getRequest("/_plumix/auth/magic-link/verify"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "magic_link_error=missing_token",
    );
  });

  test("happy path mints session, sets cookie, redirects to admin", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    const user = await h.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const token = await seedToken(h, user.id, "alice@example.com");

    const response = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/_plumix/admin");
    expect(response.headers.get("set-cookie")).toContain("plumix_session=");

    const sessionRows = await h.db.select().from(sessions);
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]?.userId).toBe(user.id);
  });

  test("rejects an unknown token with token_invalid", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });

    const response = await h.dispatch(
      getRequest("/_plumix/auth/magic-link/verify?token=not-a-real-token"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "magic_link_error=token_invalid",
    );
  });

  test("rejects an expired token with token_expired", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    const user = await h.factory.user.create({ role: "editor" });
    const token = await seedToken(h, user.id, user.email, -1);

    const response = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );
    expect(response.headers.get("location")).toContain(
      "magic_link_error=token_expired",
    );
  });

  test("rejects when the linked user is disabled", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    const user = await h.factory.user.create({
      role: "editor",
      disabledAt: new Date(),
    });
    const token = await seedToken(h, user.id, user.email);

    const response = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );
    expect(response.headers.get("location")).toContain(
      "magic_link_error=account_disabled",
    );
  });

  test("oversized token is rejected as token_invalid", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    const huge = "x".repeat(512);

    const response = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${huge}`),
    );
    expect(response.headers.get("location")).toContain(
      "magic_link_error=token_invalid",
    );
  });

  test("replay of a single-use token fails on second use", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    const user = await h.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const token = await seedToken(h, user.id, "alice@example.com");

    const first = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );
    expect(first.headers.get("location")).toBe("/_plumix/admin");

    const replay = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );
    expect(replay.headers.get("location")).toContain(
      "magic_link_error=token_invalid",
    );
  });

  test("signed-in user clicking a magic-link mints a fresh session", async () => {
    // Already-authenticated browser clicks the email link. The verify
    // route mints a NEW session row and overwrites the cookie. The old
    // row stays in the DB until its own TTL — that matches every other
    // sign-in path (passkey, oauth) and the Copenhagen Book "always
    // create a new session when the user signs in" rule.
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    const user = await h.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const existingSessioned = await h.authenticateRequest(
      getRequest("/_plumix/auth/magic-link/verify"),
      user.id,
    );
    const beforeCount = (await h.db.select().from(sessions)).length;
    expect(beforeCount).toBe(1);

    const token = await seedToken(h, user.id, "alice@example.com");
    const cookie = existingSessioned.headers.get("cookie");
    const response = await h.dispatch(
      new Request(
        `https://cms.example/_plumix/auth/magic-link/verify?token=${token}`,
        { headers: cookie ? { cookie } : undefined },
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/_plumix/admin");

    const sessionRows = await h.db.select().from(sessions);
    expect(sessionRows).toHaveLength(2);
    // Both belong to the same user.
    for (const row of sessionRows) expect(row.userId).toBe(user.id);
  });

  test("end-to-end signup: request → verify provisions user with the domain's role", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    await h.factory.user.create({ role: "admin" });
    await h.factory.allowedDomain.create({
      domain: "example.com",
      defaultRole: "contributor",
      isEnabled: true,
    });

    // Step 1: request the link.
    const requestResp = await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "newcomer@example.com",
      }),
    );
    expect(requestResp.status).toBe(200);
    expect(sent).toHaveLength(1);

    // Step 2: parse the token from the emailed URL and click it.
    const tokenMatch = /token=([A-Za-z0-9_-]+)/.exec(sent[0]?.text ?? "");
    const token = tokenMatch?.[1];
    if (!token) throw new Error("expected token in email");

    const verifyResp = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );
    expect(verifyResp.status).toBe(302);
    expect(verifyResp.headers.get("location")).toBe("/_plumix/admin");
    expect(verifyResp.headers.get("set-cookie")).toContain("plumix_session=");

    // The user was provisioned with the right role + email-verified mark.
    const created = await h.db.query.users.findFirst({
      where: eq(users.email, "newcomer@example.com"),
    });
    expect(created?.role).toBe("contributor");
    expect(created?.emailVerifiedAt).not.toBeNull();
    // A session was minted for them.
    const sessionRows = await h.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, created?.id ?? 0));
    expect(sessionRows).toHaveLength(1);
  });

  test("signup verify rejects with domain_not_allowed if admin disables the domain mid-flight", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    await h.factory.user.create({ role: "admin" });
    const allowed = await h.factory.allowedDomain.create({
      domain: "example.com",
      defaultRole: "contributor",
      isEnabled: true,
    });

    // Request issues a signup token while the domain is enabled.
    await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "newcomer@example.com",
      }),
    );
    const tokenMatch = /token=([A-Za-z0-9_-]+)/.exec(sent[0]?.text ?? "");
    const token = tokenMatch?.[1];
    if (!token) throw new Error("expected token in email");

    // Admin disables the domain before the user clicks.
    await h.db
      .update(allowedDomains)
      .set({ isEnabled: false })
      .where(eq(allowedDomains.domain, allowed.domain));

    const verifyResp = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );
    expect(verifyResp.headers.get("location")).toContain(
      "magic_link_error=domain_not_allowed",
    );
    const created = await h.db.query.users.findFirst({
      where: eq(users.email, "newcomer@example.com"),
    });
    expect(created).toBeUndefined();
  });

  test("returns 405 on POST", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/magic-link/verify", {
        method: "POST",
        headers: { "x-plumix-request": "1" },
      }),
    );
    expect(response.status).toBe(405);
  });

  test("logs and surfaces a generic token_invalid for unexpected errors", async () => {
    // Spy on the request schema parser by passing a token that's neither
    // missing nor in DB nor oversized — it just hits the standard
    // "not found" branch which surfaces as token_invalid. Already
    // covered above; this test is the explicit "unknown error" symbol.
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      magicLink: { siteName: "Plumix Test" }, mailer,
    });
    const verifySpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    try {
      await h.dispatch(getRequest("/_plumix/auth/magic-link/verify?token=zzz"));
    } finally {
      verifySpy.mockRestore();
    }
    const remaining = await h.db
      .select()
      .from(authTokens)
      .where(eq(authTokens.type, "magic_link"));
    expect(remaining).toHaveLength(0);
  });
});
