import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { oauthAccounts } from "../../db/schema/oauth_accounts.js";
import { sessions } from "../../db/schema/sessions.js";
import { users } from "../../db/schema/users.js";
import { createDispatcherHarness } from "../../test/dispatcher.js";
import { github } from "./providers/github.js";
import { google } from "./providers/google.js";
import { issueOAuthState } from "./state.js";

const TEST_OAUTH = {
  github: github({ clientId: "gh-client", clientSecret: "gh-secret" }),
  google: google({ clientId: "gg-client", clientSecret: "gg-secret" }),
} as const;

interface StubResponse {
  readonly status?: number;
  readonly body: unknown;
}

type Stub = StubResponse | ((url: string, init?: RequestInit) => StubResponse);

const fetchMock =
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(routes: Record<string, Stub>): void {
  // Match longest-prefix first so a specific pattern like
  // `https://api.github.com/user/emails` wins over the parent
  // `https://api.github.com/user`.
  const patterns = Object.entries(routes).sort(
    ([a], [b]) => b.length - a.length,
  );
  fetchMock.mockImplementation((url, init) => {
    for (const [pattern, stub] of patterns) {
      if (url.startsWith(pattern)) {
        const result = typeof stub === "function" ? stub(url, init) : stub;
        return Promise.resolve(
          new Response(JSON.stringify(result.body), {
            status: result.status ?? 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
    }
    return Promise.reject(new Error(`unstubbed fetch: ${url}`));
  });
}

function get(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  path: string,
): Promise<Response> {
  return h.dispatch(new Request(`https://cms.example${path}`));
}

describe("oauth start route", () => {
  test("redirects to bootstrap when no users exist", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/oauth/github/start"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/_plumix/admin/bootstrap");
  });

  test("bootstrapVia=first-method-wins lets the OAuth flow start with zero users", async () => {
    const h = await createDispatcherHarness({
      oauth: TEST_OAUTH,
      bootstrapVia: "first-method-wins",
    });
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/oauth/github/start"),
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toContain("github.com/login/oauth/authorize");
  });

  test("redirects to provider authorize URL with PKCE + state", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");

    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/oauth/github/start"),
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    if (!location) throw new Error("missing location header");

    const url = new URL(location);
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("gh-client");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://cms.example/_plumix/auth/oauth/github/callback",
    );

    // State token landed in auth_tokens.
    const rows = await h.db.select().from(authTokens);
    expect(rows.some((r) => r.type === "oauth_state")).toBe(true);
  });

  test("redirects to login with error when provider isn't configured", async () => {
    const h = await createDispatcherHarness();
    await h.seedUser("admin");
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/oauth/github/start"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "/_plumix/admin/login?oauth_error=provider_not_configured",
    );
  });

  test("returns 405 on POST", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/oauth/github/start", {
        method: "POST",
        headers: { "x-plumix-request": "1" },
      }),
    );
    expect(response.status).toBe(405);
  });

  test("redirects to login with provider_not_configured for an unknown key", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/oauth/twitter/start"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "oauth_error=provider_not_configured",
    );
  });

  test("returns 404 on a malformed provider key (uppercase / specials)", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/oauth/Bad-Key!/start"),
    );
    expect(response.status).toBe(404);
  });

  test("rejects `constructor` (prototype-chain key) as not configured", async () => {
    // The path regex accepts `constructor` (lowercase letters only), but
    // a direct `providers[key]` lookup would walk the prototype chain
    // and return `Object`. `Object.hasOwn` keeps the lookup confined to
    // the operator's config map.
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/oauth/constructor/start"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "oauth_error=provider_not_configured",
    );
  });
});

describe("oauth callback route", () => {
  async function seedState(
    h: Awaited<ReturnType<typeof createDispatcherHarness>>,
    provider: "github" | "google",
    codeVerifier: string,
  ): Promise<string> {
    const { state } = await issueOAuthState(h.db, { provider, codeVerifier });
    return state;
  }

  test("rejects callback when state is missing", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    const response = await get(
      h,
      "/_plumix/auth/oauth/github/callback?code=abc",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "oauth_error=state_invalid",
    );
  });

  test("rejects callback when state is unknown", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    const response = await get(
      h,
      "/_plumix/auth/oauth/github/callback?code=abc&state=nope",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "oauth_error=state_expired",
    );
  });

  test("rejects callback when state was issued for a different provider", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    const state = await seedState(h, "google", "verifier");
    const response = await get(
      h,
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "oauth_error=state_invalid",
    );
  });

  test("forwards a provider error param to the login page", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    const response = await get(
      h,
      "/_plumix/auth/oauth/github/callback?error=access_denied",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "oauth_error=state_invalid",
    );
  });

  test("token exchange uses HTTP Basic Authorization for client credentials (RFC 6749 / Copenhagen Book)", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");
    await h.factory.allowedDomain.create({
      domain: "example.com",
      defaultRole: "subscriber",
      isEnabled: true,
    });
    const state = await seedState(h, "github", "v-basic");
    const tokenCalls: { authorization: string | null; body: string | null }[] =
      [];
    fetchMock.mockImplementation((url, init) => {
      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        const headers = new Headers(init?.headers);
        const bodyText =
          typeof init?.body === "string"
            ? init.body
            : init?.body instanceof URLSearchParams
              ? init.body.toString()
              : null;
        tokenCalls.push({
          authorization: headers.get("authorization"),
          body: bodyText,
        });
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: "tk" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (url.startsWith("https://api.github.com/user")) {
        const body = url.endsWith("/emails")
          ? [{ email: "x@example.com", primary: true, verified: true }]
          : {
              id: 1,
              login: "x",
              name: null,
              email: null,
              avatar_url: null,
            };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error(`unstubbed fetch: ${url}`));
    });

    await get(h, `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`);

    expect(tokenCalls).toHaveLength(1);
    const expectedBasic = `Basic ${btoa("gh-client:gh-secret")}`;
    expect(tokenCalls[0]?.authorization).toBe(expectedBasic);
    // client_secret must NOT also appear in the body — keeps it out of
    // server access logs that record request bodies.
    expect(tokenCalls[0]?.body ?? "").not.toContain("client_secret");
  });

  test("happy path — links to existing user, mints session, sets cookie, redirects to admin", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    const seeded = await h.seedUser("editor");
    // Force the email so the verified-email link path is exercised.
    await h.db
      .update(users)
      .set({ email: "alice@example.com" })
      .where(eq(users.id, seeded.id));

    const state = await seedState(h, "github", "v-1");

    answer({
      "https://github.com/login/oauth/access_token": {
        body: { access_token: "tk", token_type: "bearer" },
      },
      "https://api.github.com/user": {
        body: {
          id: 9001,
          login: "alice",
          name: "Alice",
          email: "alice@example.com",
          avatar_url: "https://example.com/a.png",
        },
      },
      "https://api.github.com/user/emails": {
        body: [{ email: "alice@example.com", primary: true, verified: true }],
      },
    });

    const response = await get(
      h,
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/_plumix/admin");
    expect(response.headers.get("set-cookie")).toContain("plumix_session=");

    const link = await h.db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.providerAccountId, "9001"));
    expect(link).toHaveLength(1);
    expect(link[0]?.userId).toBe(seeded.id);

    const sessionRows = await h.db.select().from(sessions);
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]?.userId).toBe(seeded.id);
  });

  test("domain-gated signup creates a user with the domain's default role", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");
    await h.factory.allowedDomain.create({
      domain: "example.com",
      defaultRole: "author",
      isEnabled: true,
    });

    const state = await seedState(h, "google", "v-2");

    answer({
      "https://oauth2.googleapis.com/token": {
        body: { access_token: "tk", id_token: "id", token_type: "bearer" },
      },
      "https://openidconnect.googleapis.com/v1/userinfo": {
        body: {
          sub: "google-42",
          email: "newcomer@example.com",
          email_verified: true,
          name: "New Comer",
          picture: "https://example.com/pic.png",
        },
      },
    });

    const response = await get(
      h,
      `/_plumix/auth/oauth/google/callback?code=abc&state=${state}`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/_plumix/admin");

    const created = await h.db.query.users.findFirst({
      where: eq(users.email, "newcomer@example.com"),
    });
    expect(created?.role).toBe("author");
  });

  test("unknown domain redirects to login with domain_not_allowed", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");

    const state = await seedState(h, "google", "v-3");

    answer({
      "https://oauth2.googleapis.com/token": {
        body: { access_token: "tk", token_type: "bearer" },
      },
      "https://openidconnect.googleapis.com/v1/userinfo": {
        body: {
          sub: "g-1",
          email: "stranger@notallowed.com",
          email_verified: true,
          name: "Stranger",
          picture: null,
        },
      },
    });

    const response = await get(
      h,
      `/_plumix/auth/oauth/google/callback?code=abc&state=${state}`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "oauth_error=domain_not_allowed",
    );
    // No session, no user.
    expect(await h.db.$count(sessions)).toBe(0);
    const stranger = await h.db.query.users.findFirst({
      where: eq(users.email, "stranger@notallowed.com"),
    });
    expect(stranger).toBeUndefined();
  });

  test("token exchange failure redirects to login with code_exchange_failed", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");

    const state = await seedState(h, "github", "v-x");

    answer({
      "https://github.com/login/oauth/access_token": {
        status: 500,
        body: { error: "server_error" },
      },
    });

    const response = await get(
      h,
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "oauth_error=code_exchange_failed",
    );
  });

  test("github email fallback — provisions a user from /user/emails when /user.email is null", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");
    await h.factory.allowedDomain.create({
      domain: "example.com",
      defaultRole: "subscriber",
      isEnabled: true,
    });
    const state = await seedState(h, "github", "v-fallback");

    answer({
      "https://github.com/login/oauth/access_token": {
        body: { access_token: "tk", token_type: "bearer" },
      },
      "https://api.github.com/user": {
        body: {
          id: 4242,
          login: "newcomer",
          name: "New Comer",
          email: null,
          avatar_url: null,
        },
      },
      "https://api.github.com/user/emails": {
        body: [
          { email: "newcomer@example.com", primary: true, verified: true },
        ],
      },
    });

    const response = await get(
      h,
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/_plumix/admin");

    const created = await h.db.query.users.findFirst({
      where: eq(users.email, "newcomer@example.com"),
    });
    expect(created?.role).toBe("subscriber");
    expect(created?.emailVerifiedAt).not.toBeNull();
  });

  test("github email fallback rejects when the primary is unverified", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");
    await h.factory.allowedDomain.create({
      domain: "example.com",
      defaultRole: "subscriber",
      isEnabled: true,
    });
    const state = await seedState(h, "github", "v-fallback-unverified");

    answer({
      "https://github.com/login/oauth/access_token": {
        body: { access_token: "tk", token_type: "bearer" },
      },
      "https://api.github.com/user": {
        body: {
          id: 4243,
          login: "u",
          name: null,
          email: null,
          avatar_url: null,
        },
      },
      "https://api.github.com/user/emails": {
        body: [{ email: "u@example.com", primary: true, verified: false }],
      },
    });

    const response = await get(
      h,
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
    );
    expect(response.headers.get("location")).toContain(
      "oauth_error=email_unverified",
    );
  });

  test("malformed userinfo body (missing fields) rejects with email_missing", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");
    const state = await seedState(h, "google", "v-malformed");

    answer({
      "https://oauth2.googleapis.com/token": {
        body: { access_token: "tk", token_type: "bearer" },
      },
      "https://openidconnect.googleapis.com/v1/userinfo": {
        body: { sub: "g-malformed" },
      },
    });

    const response = await get(
      h,
      `/_plumix/auth/oauth/google/callback?code=abc&state=${state}`,
    );
    expect(response.headers.get("location")).toContain(
      "oauth_error=email_missing",
    );
  });

  test("oversized code is rejected before any provider call", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");
    const state = await seedState(h, "github", "v-oversize");
    const huge = "x".repeat(8192);

    fetchMock.mockImplementation(() =>
      Promise.reject(new Error("provider must not be called")),
    );

    const response = await get(
      h,
      `/_plumix/auth/oauth/github/callback?code=${huge}&state=${state}`,
    );
    expect(response.headers.get("location")).toContain(
      "oauth_error=state_invalid",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("provider-error callback consumes the state row", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");
    const state = await seedState(h, "github", "v-canceled");

    const response = await get(
      h,
      `/_plumix/auth/oauth/github/callback?error=access_denied&state=${state}`,
    );
    expect(response.headers.get("location")).toContain(
      "oauth_error=state_invalid",
    );

    // The state row must be gone — replaying with the same value can't
    // reach the code-exchange path.
    answer({
      "https://github.com/login/oauth/access_token": { body: {} },
    });
    const replay = await get(
      h,
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
    );
    expect(replay.headers.get("location")).toContain(
      "oauth_error=state_expired",
    );
  });

  test("state is consumed even when the provider call fails (no replay)", async () => {
    const h = await createDispatcherHarness({ oauth: TEST_OAUTH });
    await h.seedUser("admin");
    const state = await seedState(h, "github", "v-y");

    answer({
      "https://github.com/login/oauth/access_token": {
        status: 500,
        body: {},
      },
    });

    await get(h, `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`);
    // Second use of the same state must fail at state lookup.
    answer({
      "https://github.com/login/oauth/access_token": { body: {} },
    });
    const replay = await get(
      h,
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
    );
    expect(replay.headers.get("location")).toContain(
      "oauth_error=state_expired",
    );
  });
});
