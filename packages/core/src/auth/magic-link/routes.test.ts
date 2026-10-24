import { describe, expect, test, vi } from "vitest";

import type { Session } from "../../db/schema/sessions.js";
import type { CreateDispatcherHarnessOptions } from "../../test/dispatcher.js";
import type { Mailer } from "../contract/mailer.js";
import { eq, sql } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { sessions } from "../../db/schema/sessions.js";
import { users } from "../../db/schema/users.js";
import { definePlugin } from "../../plugin/define.js";
import { text } from "../../plugin/fields/index.js";
import { silentLogger } from "../../test/context.js";
import { createDispatcherHarness } from "../../test/dispatcher.js";
import { poCatalogs } from "../../test/po-catalog.js";

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

function formPost(
  path: string,
  fields: Record<string, string>,
  origin = "https://cms.example",
): Request {
  return new Request(`https://cms.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function getRequest(path: string, headers?: HeadersInit): Request {
  return new Request(`https://cms.example${path}`, { headers });
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
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
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

  test("sends core's magicLink mail, text and HTML, in English", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      config: { mailer, auth: { magicLink: { siteName: "Plumix Test" } } },
    });
    await h.factory.user.create({ email: "alice@example.com" });

    await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "alice@example.com",
      }),
    );

    const url = /https:\/\/\S+token=[\w-]+/.exec(sent[0]?.text ?? "")?.[0];
    expect(sent[0]).toMatchObject({
      to: "alice@example.com",
      subject: "Sign in to Plumix Test",
      text: [
        "Sign in to Plumix Test by opening this link:",
        "",
        url,
        "",
        "The link expires in 15 minutes.",
        "",
        "If you didn't request this, you can ignore this email.",
      ].join("\n"),
    });
    expect(sent[0]?.html).toContain(`<a href="${url}">`);
    expect(sent[0]?.html).toContain("The link expires in 15 minutes.");
  });

  test("sends it in German to a user whose locale is German", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
        i18n: { defaultLocale: "en", locales: ["en", "de"] },
      },
      // Core's own catalog, which unit tests otherwise resolve to empty.
      pluginCatalogs: poCatalogs({
        de: new URL("../../../locales/mail-de.po", import.meta.url),
      }),
    });
    await h.factory.user.create({
      email: "klaus@example.com",
      meta: { locale: "de" },
    });

    await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "klaus@example.com",
      }),
    );

    expect(sent[0]?.subject).toBe("Bei Plumix Test anmelden");
    expect(sent[0]?.text).toContain(
      "Melden Sie sich bei Plumix Test über diesen Link an:",
    );
    expect(sent[0]?.text).toContain("Der Link läuft in 15 Minuten ab.");
    expect(sent[0]?.html).toContain("Der Link läuft in 15 Minuten ab.");
  });

  test("the verify link in the email carries the configured basePath", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        basePath: "/custom-directory",
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    await h.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });

    const response = await h.dispatch(
      postRequest("/custom-directory/_plumix/auth/magic-link/request", {
        email: "alice@example.com",
      }),
    );
    expect(response.status).toBe(200);
    expect(sent[0]?.text).toContain(
      "https://cms.example/custom-directory/_plumix/auth/magic-link/verify?token=",
    );
  });

  test("folds a safe redirectTo into the emailed verify link", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    await h.factory.user.create({
      email: "alice@example.com",
      role: "subscriber",
    });

    const response = await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "alice@example.com",
        redirectTo: "/account/saved",
      }),
    );
    expect(response.status).toBe(200);
    expect(sent[0]?.text).toMatch(/[?&]redirectTo=%2Faccount%2Fsaved/);
  });

  test("puts the site root in the emailed link for an unsafe redirectTo", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    await h.factory.user.create({
      email: "alice@example.com",
      role: "subscriber",
    });

    await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "alice@example.com",
        redirectTo: "https://evil.com",
      }),
    );
    const url = new URL(h.mail.sent("magicLink")[0]?.props.url ?? "");
    expect(url.searchParams.get("redirectTo")).toBe("/");
  });

  test("is callable from a theme-origin page (custom header + Origin gate)", async () => {
    // The theme login page lives on the site origin and posts here with the
    // custom CSRF header.
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    await h.factory.user.create({
      email: "alice@example.com",
      role: "subscriber",
    });

    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/magic-link/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-plumix-request": "1",
          origin: "https://cms.example",
        },
        body: JSON.stringify({
          email: "alice@example.com",
          redirectTo: "/account",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toMatch(/[?&]redirectTo=%2Faccount/);
  });

  test("returns the same shape when user does not exist (no enumeration)", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
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
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
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
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
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

  test("a plain form post sends the link and lands on ?magic_link_sent=1", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Plumix Test" } } },
    });
    await h.factory.user.create({ email: "alice@example.com" });

    const response = await h.dispatch(
      formPost("/_plumix/auth/magic-link/request", {
        email: "alice@example.com",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_sent=1",
    );
    h.mail.assertSent("magicLink", { to: "alice@example.com", times: 1 });
  });

  test("a form post with a malformed email lands on ?magic_link_error=invalid_input", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Plumix Test" } } },
    });

    const response = await h.dispatch(
      formPost("/_plumix/auth/magic-link/request", { email: "not-an-email" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_error=invalid_input",
    );
  });

  test("a cross-origin form post is refused as csrf_origin_mismatch", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Plumix Test" } } },
    });

    const response = await h.dispatch(
      formPost(
        "/_plumix/auth/magic-link/request",
        { email: "alice@example.com" },
        "https://evil.example",
      ),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "forbidden",
      reason: "csrf_origin_mismatch",
    });
  });

  test("a form post's redirectTo field rides into the emailed link", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Plumix Test" } } },
    });
    await h.factory.user.create({ email: "alice@example.com" });

    await h.dispatch(
      formPost("/_plumix/auth/magic-link/request", {
        email: "alice@example.com",
        redirectTo: "/account",
      }),
    );

    const url = new URL(h.mail.sent("magicLink")[0]?.props.url ?? "");
    expect(url.searchParams.get("redirectTo")).toBe("/account");
  });

  test("a fetch's malformed body answers 400 invalid_input", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Plumix Test" } } },
    });

    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/magic-link/request", {
        method: "POST",
        headers: { "x-plumix-request": "1" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_input" });
  });
});

/** Sign one user in through the verify link, and hand back the session row. */
async function sessionFromVerify(
  options: Pick<CreateDispatcherHarnessOptions, "clientAddress">,
  headers?: HeadersInit,
): Promise<Session | undefined> {
  const { mailer } = captureMailer();
  const h = await createDispatcherHarness({
    ...options,
    config: {
      mailer,
      auth: { magicLink: { siteName: "Plumix Test" } },
    },
  });
  const user = await h.factory.user.create({ email: "alice@example.com" });
  const { token } = await h.factory.authToken.create({
    userId: user.id,
    email: "alice@example.com",
  });

  await h.dispatch(
    getRequest(`/_plumix/auth/magic-link/verify?token=${token}`, headers),
  );

  const [session] = await h.db.select().from(sessions);
  return session;
}

describe("magic-link verify route", () => {
  test("missing token redirects with magic_link_error=missing_token", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
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
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    const user = await h.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const token = (
      await h.factory.authToken.create({
        userId: user.id,
        email: "alice@example.com",
      })
    ).token;

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

  test("records the address the runtime supplied, clipped to the column's cap", async () => {
    const overLong = `2001:db8:${"a".repeat(200)}`;

    const session = await sessionFromVerify({ clientAddress: overLong });

    expect(session?.ipAddress).toBe(overLong.slice(0, 64));
  });

  test("records no address when the runtime supplied none, whatever the request forwards", async () => {
    const session = await sessionFromVerify(
      {},
      {
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.9",
      },
    );

    expect(session?.ipAddress).toBeNull();
  });

  test("under a basePath the post-verify redirect and cookie are base-scoped", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        basePath: "/custom-directory",
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    const user = await h.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const token = (
      await h.factory.authToken.create({
        userId: user.id,
        email: "alice@example.com",
      })
    ).token;

    const response = await h.dispatch(
      getRequest(
        `/custom-directory/_plumix/auth/magic-link/verify?token=${token}`,
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/custom-directory/_plumix/admin",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "Path=/custom-directory",
    );
  });

  test("honours a safe redirectTo on the verify link", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    const user = await h.factory.user.create({
      email: "alice@example.com",
      role: "subscriber",
    });
    const token = (
      await h.factory.authToken.create({
        userId: user.id,
        email: "alice@example.com",
      })
    ).token;

    const response = await h.dispatch(
      getRequest(
        `/_plumix/auth/magic-link/verify?token=${token}&redirectTo=%2Faccount%2Fsaved`,
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/account/saved");
    expect(response.headers.get("set-cookie")).toContain("plumix_session=");
  });

  test("lands on the site root when the verify redirectTo is unsafe", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    const user = await h.factory.user.create({
      email: "alice@example.com",
      role: "subscriber",
    });
    const token = (
      await h.factory.authToken.create({
        userId: user.id,
        email: "alice@example.com",
      })
    ).token;

    const response = await h.dispatch(
      getRequest(
        `/_plumix/auth/magic-link/verify?token=${token}&redirectTo=%2F%2Fevil.com`,
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
  });

  test("worked theme wiring: request with redirectTo → verify returns to the theme page", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    await h.factory.user.create({
      email: "reader@example.com",
      role: "subscriber",
    });

    const requestResp = await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "reader@example.com",
        redirectTo: "/blog/hello-world",
      }),
    );
    expect(requestResp.status).toBe(200);

    // The theme's own login page URL rode all the way into the email.
    const verifyPath =
      /https:\/\/cms\.example(\/_plumix\/auth\/magic-link\/verify\?\S+)/.exec(
        sent[0]?.text ?? "",
      )?.[1];
    if (!verifyPath) throw new Error("expected verify URL in email");
    expect(verifyPath).toMatch(/redirectTo=%2Fblog%2Fhello-world/);

    const verifyResp = await h.dispatch(getRequest(verifyPath));
    expect(verifyResp.status).toBe(302);
    expect(verifyResp.headers.get("location")).toBe("/blog/hello-world");
    expect(verifyResp.headers.get("set-cookie")).toContain("plumix_session=");
  });

  test("with magic links off, a token issued earlier signs nobody in", async () => {
    const h = await createDispatcherHarness();
    const user = await h.factory.user.create({ email: "alice@example.com" });
    const { token } = await h.factory.authToken.create({
      userId: user.id,
      email: "alice@example.com",
    });

    const response = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );

    expect(response.headers.get("location")).toContain(
      "magic_link_error=token_invalid",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("rejects an unknown token with token_invalid", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
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
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    const user = await h.factory.user.create({ role: "editor" });
    const token = (
      await h.factory.authToken.create({
        userId: user.id,
        email: user.email,
        expiresAt: new Date(Date.now() - 1000),
      })
    ).token;

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
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    const user = await h.factory.user.create({
      role: "editor",
      disabledAt: new Date(),
    });
    const token = (
      await h.factory.authToken.create({ userId: user.id, email: user.email })
    ).token;

    const response = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );
    expect(response.headers.get("location")).toContain(
      "magic_link_error=account_disabled",
    );
  });

  test("a token whose user row is gone is refused as link_broken", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Plumix Test" } } },
    });
    const user = await h.factory.user.create({ email: "gone@example.com" });
    const { token } = await h.factory.authToken.create({
      userId: user.id,
      email: user.email,
    });
    await h.db.run(sql`PRAGMA foreign_keys = OFF`);
    await h.db.delete(users).where(eq(users.id, user.id));
    await h.db.run(sql`PRAGMA foreign_keys = ON`);

    const response = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );

    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_error=link_broken",
    );
  });

  test("an identity refusal is logged as sign_in_refused", async () => {
    const warned: { msg: string; meta: unknown }[] = [];
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Plumix Test" } } },
      logger: {
        ...silentLogger,
        warn: (msg, meta) => warned.push({ msg, meta }),
      },
    });
    const user = await h.factory.user.create({ disabledAt: new Date() });
    const { token } = await h.factory.authToken.create({
      userId: user.id,
      email: user.email,
    });

    await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );

    expect(warned).toEqual([
      {
        msg: "sign_in_refused",
        meta: {
          method: "magic_link",
          code: "account_disabled",
          requestId: expect.any(String) as unknown,
        },
      },
    ]);
  });

  test("oversized token is rejected as token_invalid", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
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
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    const user = await h.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const token = (
      await h.factory.authToken.create({
        userId: user.id,
        email: "alice@example.com",
      })
    ).token;

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
    // The old row stays until its own TTL, matching every other sign-in path
    // and the Copenhagen Book "always create a new session" rule.
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
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

    const token = (
      await h.factory.authToken.create({
        userId: user.id,
        email: "alice@example.com",
      })
    ).token;
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
      config: {
        mailer,
        auth: {
          magicLink: { siteName: "Plumix Test" },
          allowedDomains: { "example.com": "editor" },
        },
      },
    });
    await h.factory.user.create({ role: "admin" });

    // Step 1: request the link.
    const requestResp = await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "ann@example.com",
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
      where: eq(users.email, "ann@example.com"),
    });
    expect(created?.role).toBe("editor");
    expect(created?.emailVerifiedAt).not.toBeNull();
    // A session was minted for them.
    const sessionRows = await h.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, created?.id ?? 0));
    expect(sessionRows).toHaveLength(1);
  });

  test("end-to-end self-signup: unlisted email registers as the default role", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: {
          magicLink: { siteName: "Plumix Test" },
          selfSignup: { defaultRole: "subscriber" },
        },
      },
    });
    // One user exists (bootstrap satisfied); no allowed domain for
    // this address — only open self-signup lets it through.
    await h.factory.user.create({ role: "admin" });

    const requestResp = await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "visitor@anywhere.test",
      }),
    );
    expect(requestResp.status).toBe(200);
    expect(sent).toHaveLength(1);

    const tokenMatch = /token=([A-Za-z0-9_-]+)/.exec(sent[0]?.text ?? "");
    const token = tokenMatch?.[1];
    if (!token) throw new Error("expected token in email");

    const verifyResp = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );
    expect(verifyResp.status).toBe(302);
    expect(verifyResp.headers.get("set-cookie")).toContain("plumix_session=");

    const created = await h.db.query.users.findFirst({
      where: eq(users.email, "visitor@anywhere.test"),
    });
    expect(created?.role).toBe("subscriber");
    expect(created?.emailVerifiedAt).not.toBeNull();
  });

  test("a user signing up stores the user fields' defaults", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: {
          magicLink: { siteName: "Plumix Test" },
          selfSignup: { defaultRole: "subscriber" },
        },
        plugins: [
          definePlugin("profiles", {
            setup: (ctx) => {
              ctx.registerUserMetaBox("profile", {
                label: "Profile",
                fields: [text("pronouns").default("they/them"), text("bio")],
              });
            },
          }),
        ],
      },
    });

    await h.factory.user.create({ role: "admin" });
    await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "visitor@anywhere.test",
      }),
    );
    const token = /token=([A-Za-z0-9_-]+)/.exec(sent[0]?.text ?? "")?.[1];
    if (!token) throw new Error("expected token in email");
    await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );

    const created = await h.db.query.users.findFirst({
      where: eq(users.email, "visitor@anywhere.test"),
    });
    expect(created?.meta).toEqual({ pronouns: "they/them" });
  });

  test("without self-signup an unlisted email is refused (no leak, no token)", async () => {
    const { mailer, sent } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
    });
    await h.factory.user.create({ role: "admin" });

    // Generic 200, but nothing is issued for an unlisted domain.
    const resp = await h.dispatch(
      postRequest("/_plumix/auth/magic-link/request", {
        email: "visitor@anywhere.test",
      }),
    );
    expect(resp.status).toBe(200);
    expect(sent).toHaveLength(0);
    const tokens = await h.db.select().from(authTokens);
    expect(tokens).toHaveLength(0);
  });

  test("returns 405 on POST", async () => {
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
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
    const { mailer } = captureMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Plumix Test" } },
      },
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

describe("magic-link verify of a link issued to a new address", () => {
  async function signUpHarness(
    options: {
      readonly selfSignup?: boolean;
      readonly bootstrap?: boolean;
    } = {},
  ) {
    return createDispatcherHarness({
      config: {
        auth: {
          magicLink: { siteName: "Plumix Test" },
          allowedDomains: { "example.com": "editor" },
          ...(options.selfSignup === true
            ? { selfSignup: { defaultRole: "subscriber" } }
            : {}),
          ...(options.bootstrap === true
            ? { bootstrapVia: "first-method-wins" }
            : {}),
        },
      },
    });
  }

  async function verifyLinkFor(
    h: Awaited<ReturnType<typeof signUpHarness>>,
    email: string,
  ): Promise<Response> {
    const { token } = await h.factory.authToken.create({ userId: null, email });
    return h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );
  }

  test("provisions a user with the domain's role, email verified", async () => {
    const h = await signUpHarness();
    await h.seedUser("admin");

    await verifyLinkFor(h, "ann@example.com");

    const created = await h.db.query.users.findFirst({
      where: eq(users.email, "ann@example.com"),
    });
    expect(created?.role).toBe("editor");
    expect(created?.emailVerifiedAt).not.toBeNull();
  });

  test("matches the domain whatever its case", async () => {
    const h = await signUpHarness();
    await h.seedUser("admin");

    await verifyLinkFor(h, "ANN@Example.COM");

    const created = await h.db.query.users.findFirst({
      where: eq(users.email, "ANN@Example.COM"),
    });
    expect(created?.role).toBe("editor");
  });

  test("under selfSignup a listed domain keeps its own role", async () => {
    const h = await signUpHarness({ selfSignup: true });
    await h.seedUser("admin");

    await verifyLinkFor(h, "ann@example.com");

    const ann = await h.db.query.users.findFirst({
      where: eq(users.email, "ann@example.com"),
    });
    expect(ann?.role).toBe("editor");
  });

  test("under selfSignup an unlisted domain gets the default role", async () => {
    const h = await signUpHarness({ selfSignup: true });
    await h.seedUser("admin");

    await verifyLinkFor(h, "bob@other.com");

    const bob = await h.db.query.users.findFirst({
      where: eq(users.email, "bob@other.com"),
    });
    expect(bob?.role).toBe("subscriber");
  });

  test("without selfSignup an address on an unlisted domain is refused", async () => {
    const h = await signUpHarness();
    await h.seedUser("admin");

    const response = await verifyLinkFor(h, "bob@other.com");

    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_error=domain_not_allowed",
    );
  });

  test("is refused as registration_closed when the site has no users", async () => {
    const h = await signUpHarness();

    const response = await verifyLinkFor(h, "newcomer@example.com");

    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_error=registration_closed",
    );
  });

  test("mints the first admin under bootstrapVia first-method-wins", async () => {
    const h = await signUpHarness({ bootstrap: true });

    await verifyLinkFor(h, "first@example.com");

    const created = await h.db.query.users.findFirst({
      where: eq(users.email, "first@example.com"),
    });
    expect(created?.role).toBe("admin");
  });

  test("signs into a user who took the address while the link was pending", async () => {
    const h = await signUpHarness();
    await h.seedUser("admin");
    const raced = await h.factory.user.create({
      email: "newcomer@example.com",
      role: "subscriber",
    });
    const signedIn = h.spyAction("user:signed_in");

    await verifyLinkFor(h, "newcomer@example.com");

    expect(signedIn.lastArgs?.[0].id).toBe(raced.id);
    expect(signedIn.lastArgs?.[1]).toEqual({
      method: "magic_link",
      firstSignIn: false,
    });
  });

  test("is refused when the user who took the address is disabled", async () => {
    const h = await signUpHarness();
    await h.seedUser("admin");
    await h.factory.user.create({
      email: "newcomer@example.com",
      disabledAt: new Date(),
    });

    const response = await verifyLinkFor(h, "newcomer@example.com");

    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_error=account_disabled",
    );
  });
});

describe("magic-link verify failures land on auth.loginPath", () => {
  async function themeLoginHarness(basePath?: string) {
    const { mailer } = captureMailer();
    return createDispatcherHarness({
      config: {
        ...(basePath ? { basePath } : {}),
        mailer,
        auth: {
          magicLink: { siteName: "Plumix Test" },
          loginPath: "/account/login",
        },
      },
    });
  }

  test.each([
    ["missing", "", "missing_token"],
    ["over-long", `?token=${"x".repeat(512)}`, "token_invalid"],
    ["invalid", "?token=not-a-real-token", "token_invalid"],
  ])("a %s token redirects to the theme login", async (_name, query, code) => {
    const h = await themeLoginHarness();

    const response = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify${query}`),
    );
    expect(response.headers.get("location")).toBe(
      `/account/login?magic_link_error=${code}`,
    );
  });

  test("an expired token redirects to the theme login", async () => {
    const h = await themeLoginHarness();
    const user = await h.factory.user.create({ role: "subscriber" });
    const { token } = await h.factory.authToken.create({
      userId: user.id,
      email: user.email,
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await h.dispatch(
      getRequest(`/_plumix/auth/magic-link/verify?token=${token}`),
    );
    expect(response.headers.get("location")).toBe(
      "/account/login?magic_link_error=token_expired",
    );
  });

  test("a spent token redirects to the theme login", async () => {
    const h = await themeLoginHarness();
    const user = await h.factory.user.create({ role: "subscriber" });
    const { token } = await h.factory.authToken.create({
      userId: user.id,
      email: user.email,
    });
    const verify = () =>
      h.dispatch(getRequest(`/_plumix/auth/magic-link/verify?token=${token}`));
    await verify();

    const response = await verify();
    expect(response.headers.get("location")).toBe(
      "/account/login?magic_link_error=token_invalid",
    );
  });

  test("under a basePath the theme login carries the base path", async () => {
    const h = await themeLoginHarness("/custom-directory");

    const response = await h.dispatch(
      getRequest("/custom-directory/_plumix/auth/magic-link/verify"),
    );
    expect(response.headers.get("location")).toBe(
      "/custom-directory/account/login?magic_link_error=missing_token",
    );
  });
});
