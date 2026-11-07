import { describe, expect, test } from "vitest";

import type { RequestAuthenticator } from "../../src/auth/authenticator.js";
import { SESSION_COOKIE_NAME } from "../../src/auth/cookies.js";
import { generateToken, hashToken } from "../../src/auth/tokens.js";
import { eq } from "../../src/db/index.js";
import { users } from "../../src/db/schema/users.js";
import { testSite } from "../../src/test/site.js";

/**
 * Resolves a user by an `x-trusted-email` header: a stand-in for what an SSO
 * authenticator such as `cfAccess()` does by validating a JWT.
 */
const trustedEmailHeader: RequestAuthenticator = {
  async authenticate(request, db) {
    const email = request.headers.get("x-trusted-email");
    if (!email) return null;
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    return user ? { user, credential: "session" } : null;
  },
};

const site = await testSite({ plugins: [] });
const cappedSessions = await testSite({
  plugins: [],
  config: {
    auth: {
      sessions: {
        maxAgeSeconds: 30,
        absoluteMaxAgeSeconds: 60,
        refreshThreshold: 0.5,
      },
    },
  },
});
const trustingAHeader = await testSite({
  plugins: [],
  config: { auth: { authenticator: trustedEmailHeader } },
});

/** Reads the session the way the admin's boot probe does. */
function readSession(
  on: typeof site,
  headers: HeadersInit,
): ReturnType<typeof site.visit> {
  return on.visit("/_plumix/rpc/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ json: {} }),
  });
}

describe("the default authenticator", () => {
  test("answers the session probe for a visitor", async () => {
    const page = await readSession(site, {});

    expect(page.status).toBe(200);
  });

  test("resolves a session cookie to its user", async () => {
    const editor = await site.factory.editor.create();

    const page = await readSession(site.actingAs(editor), {});

    page.assertJson({ json: { user: { id: editor.id } } });
  });
});

describe("a configured session lifetime", () => {
  test("refuses a session past its absolute cap, inside the default one", async () => {
    const editor = await cappedSessions.factory.editor.create();
    const token = generateToken();
    await cappedSessions.factory.session.create({
      id: await hashToken(token),
      userId: editor.id,
    });
    // Past the configured 60s cap, well inside the default 90-day one.
    cappedSessions.travel({ minutes: 2 });

    const page = await readSession(cappedSessions, {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    });

    page.assertJson({ json: { user: null } });
  });
});

describe("a configured authenticator", () => {
  test("resolves the caller in place of the session cookie", async () => {
    const editor = await trustingAHeader.factory.editor.create({
      email: "trusted@enterprise.example",
    });

    const page = await readSession(trustingAHeader, {
      "x-trusted-email": "trusted@enterprise.example",
    });

    page.assertJson({ json: { user: { id: editor.id } } });
  });
});
