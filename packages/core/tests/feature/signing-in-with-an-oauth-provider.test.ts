import { describe, expect, test } from "vitest";

import { github } from "../../src/auth/oauth/providers/github.js";
import { google } from "../../src/auth/oauth/providers/google.js";
import { issueOAuthState } from "../../src/auth/oauth/state.js";
import { eq } from "../../src/db/index.js";
import { oauthAccounts } from "../../src/db/schema/oauth_accounts.js";
import { sessions } from "../../src/db/schema/sessions.js";
import { users } from "../../src/db/schema/users.js";
import { auth } from "../../src/events-and-filters/auth.js";
import { testSite } from "../../src/test/site.js";

const providers = {
  github: github({ clientId: "gh-client", clientSecret: "gh-secret" }),
  google: google({ clientId: "gg-client", clientSecret: "gg-secret" }),
};

const site = await testSite({ config: { auth: { oauth: { providers } } } });
const withMemberDomain = await testSite({
  config: {
    auth: {
      oauth: { providers },
      allowedDomains: { "example.com": "member" },
    },
  },
});
const withAuthorDomain = await testSite({
  config: {
    auth: {
      oauth: { providers },
      allowedDomains: { "example.com": "author" },
    },
  },
});
const withEditorDomain = await testSite({
  config: {
    auth: {
      oauth: { providers },
      allowedDomains: { "example.com": "editor" },
    },
  },
});
const withSelfSignup = await testSite({
  config: {
    auth: { oauth: { providers }, selfSignup: { defaultRole: "member" } },
  },
});
const withThemeLogin = await testSite({
  config: {
    auth: { oauth: { providers }, loginPath: "/account/login" },
  },
});
const withThemeLoginUnderBasePath = await testSite({
  config: {
    basePath: "/custom-directory",
    auth: { oauth: { providers }, loginPath: "/account/login" },
  },
});

/**
 * A browser following a link. `visit` marks a `/_plumix/` request as a fetch
 * unless it already carries the CSRF header, so this one carries it empty.
 */
const navigation = { headers: { "x-plumix-request": "" } };

interface Browser {
  readonly headers: Record<string, string>;
}

/** A browser holding a sign-in's cookie, which the callback reads first. */
function browserWith(nonce: string): Browser {
  return {
    headers: { ...navigation.headers, cookie: `plumix_oauth_state=${nonce}` },
  };
}

/**
 * The state a started sign-in left, as the provider sends it back, and the
 * browser that started it.
 */
async function stateFor(
  on: typeof site,
  provider: "github" | "google",
  codeVerifier: string,
  redirectTo?: string,
): Promise<{ state: string; browser: Browser }> {
  const { state, browserNonce } = await issueOAuthState(on.context.db, {
    provider,
    codeVerifier,
    redirectTo,
  });
  return { state, browser: browserWith(browserNonce) };
}

function githubAnswers(
  on: typeof site,
  profile: {
    readonly id: number;
    readonly login: string;
    readonly name: string | null;
    readonly email: string | null;
    readonly avatar_url: string | null;
  },
  emails: readonly {
    readonly email: string;
    readonly primary: boolean;
    readonly verified: boolean;
  }[],
): void {
  on.fetch.route(
    "POST",
    "https://github.com/login/oauth/access_token",
    Response.json({ access_token: "tk", token_type: "bearer" }),
  );
  on.fetch.route("GET", "https://api.github.com/user", Response.json(profile));
  on.fetch.route(
    "GET",
    "https://api.github.com/user/emails",
    Response.json(emails),
  );
}

function googleAnswers(on: typeof site, userinfo: object): void {
  on.fetch.route(
    "POST",
    "https://oauth2.googleapis.com/token",
    Response.json({ access_token: "tk", id_token: "id", token_type: "bearer" }),
  );
  on.fetch.route(
    "GET",
    "https://openidconnect.googleapis.com/v1/userinfo",
    Response.json(userinfo),
  );
}

describe("an oauth callback with a bad state", () => {
  test("is refused when the state is missing", async () => {
    const page = await site.visit(
      "/_plumix/auth/oauth/github/callback?code=abc",
      navigation,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain("oauth_error=state_invalid");
  });

  test("is refused when the state is unknown", async () => {
    const page = await site.visit(
      "/_plumix/auth/oauth/github/callback?code=abc&state=nope",
      browserWith("some-nonce"),
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain("oauth_error=state_expired");
  });

  test("is refused when the state was issued for another provider", async () => {
    const { state, browser } = await stateFor(site, "google", "verifier");

    const page = await site.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain("oauth_error=state_invalid");
  });

  test("is refused, with no provider call, when the code is oversized", async () => {
    await site.factory.admin.create();
    const { state, browser } = await stateFor(site, "github", "v-oversize");

    const page = await site.visit(
      `/_plumix/auth/oauth/github/callback?code=${"x".repeat(8192)}&state=${state}`,
      browser,
    );

    expect(page.headers.get("location")).toContain("oauth_error=state_invalid");
    site.fetch.assertNotFetched("*");
  });
});

describe("the cookie a started sign-in left", () => {
  test("is cleared when the sign-in finishes", async () => {
    await site.factory.member.create({ email: "alice@example.com" });
    const { state, browser } = await stateFor(site, "github", "v-clear");
    githubAnswers(
      site,
      {
        id: 9004,
        login: "alice",
        name: "Alice",
        email: "alice@example.com",
        avatar_url: null,
      },
      [{ email: "alice@example.com", primary: true, verified: true }],
    );

    const page = await site.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.headers.get("set-cookie")).toContain("plumix_session=");
    expect(page.headers.get("set-cookie")).toContain(
      "plumix_oauth_state=; Path=/_plumix/auth/oauth/github; Max-Age=0",
    );
  });

  test("is cleared when the sign-in is refused", async () => {
    const page = await site.visit(
      "/_plumix/auth/oauth/github/callback?code=abc&state=nope",
      browserWith("some-nonce"),
    );

    expect(page.headers.get("location")).toContain("oauth_error=state_expired");
    expect(page.headers.get("set-cookie")).toContain(
      "plumix_oauth_state=; Path=/_plumix/auth/oauth/github; Max-Age=0",
    );
  });
});

describe("a provider's error on the callback", () => {
  test("lands on the login page", async () => {
    const page = await site.visit(
      "/_plumix/auth/oauth/github/callback?error=access_denied",
      navigation,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain("oauth_error=state_invalid");
  });

  test("consumes the state, so it can't be replayed", async () => {
    await site.factory.admin.create();
    const { state, browser } = await stateFor(site, "github", "v-canceled");
    await site.visit(
      `/_plumix/auth/oauth/github/callback?error=access_denied&state=${state}`,
      browser,
    );

    const replay = await site.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    expect(replay.headers.get("location")).toContain(
      "oauth_error=state_expired",
    );
  });
});

describe("exchanging the code", () => {
  test("sends the client secret in Basic auth, never in the body", async () => {
    await withMemberDomain.factory.admin.create();
    const { state, browser } = await stateFor(
      withMemberDomain,
      "github",
      "v-basic",
    );
    githubAnswers(
      withMemberDomain,
      { id: 1, login: "x", name: null, email: null, avatar_url: null },
      [{ email: "x@example.com", primary: true, verified: true }],
    );

    await withMemberDomain.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    // client_secret stays out of the body, and so out of server access logs
    // that record request bodies.
    withMemberDomain.fetch.assertFetched(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "abc",
          redirect_uri:
            "https://cms.example/_plumix/auth/oauth/github/callback",
          client_id: "gh-client",
          code_verifier: "v-basic",
        }).toString(),
      },
    );
  });

  test("lands on the login page when the provider refuses it", async () => {
    await site.factory.admin.create();
    const { state, browser } = await stateFor(site, "github", "v-x");
    site.fetch.route(
      "POST",
      "https://github.com/login/oauth/access_token",
      Response.json({ error: "server_error" }, { status: 500 }),
    );

    const page = await site.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain(
      "oauth_error=code_exchange_failed",
    );
  });

  test("consumes the state even when the provider refuses it", async () => {
    await site.factory.admin.create();
    const { state, browser } = await stateFor(site, "github", "v-y");
    site.fetch.route(
      "POST",
      "https://github.com/login/oauth/access_token",
      Response.json({}, { status: 500 }),
    );
    await site.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    const replay = await site.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    expect(replay.headers.get("location")).toContain(
      "oauth_error=state_expired",
    );
  });
});

describe("signing in an existing user", () => {
  test("links the account, starts a session and lands on the admin", async () => {
    // The email matches, so the verified-email link path runs.
    const alice = await site.factory.editor.create({
      email: "alice@example.com",
    });
    const { state, browser } = await stateFor(site, "github", "v-1");
    githubAnswers(
      site,
      {
        id: 9001,
        login: "alice",
        name: "Alice",
        email: "alice@example.com",
        avatar_url: "https://example.com/a.png",
      },
      [{ email: "alice@example.com", primary: true, verified: true }],
    );

    const page = await site.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/_plumix/admin");
    expect(page.headers.get("set-cookie")).toContain("plumix_session=");
    const link = await site.context.db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.providerAccountId, "9001"));
    expect(link.map((row) => row.userId)).toEqual([alice.id]);
    const sessionRows = await site.context.db.select().from(sessions);
    expect(sessionRows.map((row) => row.userId)).toEqual([alice.id]);
    expect(site.events.emitted(auth.signedIn)).toMatchObject([
      {
        user: { id: alice.id },
        method: "oauth",
        provider: "github",
        firstSignIn: false,
      },
    ]);
  });

  test("returns them to a safe redirectTo carried in the state", async () => {
    await site.factory.member.create({ email: "alice@example.com" });
    const { state, browser } = await stateFor(
      site,
      "github",
      "v-rt",
      "/account/saved",
    );
    githubAnswers(
      site,
      {
        id: 9002,
        login: "alice",
        name: "Alice",
        email: "alice@example.com",
        avatar_url: null,
      },
      [{ email: "alice@example.com", primary: true, verified: true }],
    );

    const page = await site.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/account/saved");
    expect(page.headers.get("set-cookie")).toContain("plumix_session=");
  });

  // A hand-rolled or tampered row carrying an off-origin destination must not
  // become a navigation target, so the callback checks it again.
  test("lands them on the site root when the stored redirectTo is unsafe", async () => {
    await site.factory.member.create({ email: "alice@example.com" });
    const { state, browser } = await stateFor(
      site,
      "github",
      "v-rt2",
      "https://evil.com",
    );
    githubAnswers(
      site,
      {
        id: 9003,
        login: "alice",
        name: "Alice",
        email: "alice@example.com",
        avatar_url: null,
      },
      [{ email: "alice@example.com", primary: true, verified: true }],
    );

    const page = await site.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/");
  });

  // A theme's "Continue with GitHub" link carries ?redirectTo; the whole
  // round trip lands the visitor back on the page, signed in.
  test("returns them to the theme page they started from", async () => {
    await site.factory.member.create({ email: "reader@example.com" });
    const start = await site.visit(
      "/_plumix/auth/oauth/github/start?redirectTo=%2Fblog%2Fhello-world",
      navigation,
    );
    const state = new URL(start.headers.get("location") ?? "").searchParams.get(
      "state",
    );
    githubAnswers(
      site,
      {
        id: 9100,
        login: "reader",
        name: "Reader",
        email: "reader@example.com",
        avatar_url: null,
      },
      [{ email: "reader@example.com", primary: true, verified: true }],
    );

    const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

    const callback = await site.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state ?? ""}`,
      { headers: { ...navigation.headers, cookie } },
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/blog/hello-world");
    expect(callback.headers.get("set-cookie")).toContain("plumix_session=");
  });
});

describe("signing up through oauth", () => {
  test("gives a listed domain's newcomer that domain's role", async () => {
    await withAuthorDomain.factory.admin.create();
    const { state, browser } = await stateFor(
      withAuthorDomain,
      "google",
      "v-2",
    );
    googleAnswers(withAuthorDomain, {
      sub: "google-42",
      email: "newcomer@example.com",
      email_verified: true,
      name: "New Comer",
      picture: "https://example.com/pic.png",
    });

    const page = await withAuthorDomain.visit(
      `/_plumix/auth/oauth/google/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/_plumix/admin");
    const created = await withAuthorDomain.context.db.query.users.findFirst({
      where: eq(users.email, "newcomer@example.com"),
    });
    expect(created?.role).toBe("author");
    expect(withAuthorDomain.events.emitted(auth.signedIn)).toMatchObject([
      { user: { id: created?.id }, method: "oauth", firstSignIn: true },
    ]);
  });

  test("stores the provider's name and avatar on the new user", async () => {
    await withAuthorDomain.factory.admin.create();
    const { state, browser } = await stateFor(
      withAuthorDomain,
      "google",
      "v-profile",
    );
    googleAnswers(withAuthorDomain, {
      sub: "google-42",
      email: "newcomer@example.com",
      email_verified: true,
      name: "New Comer",
      picture: "https://example.com/pic.png",
    });

    await withAuthorDomain.visit(
      `/_plumix/auth/oauth/google/callback?code=abc&state=${state}`,
      browser,
    );

    const created = await withAuthorDomain.context.db.query.users.findFirst({
      where: eq(users.email, "newcomer@example.com"),
    });
    expect(created).toMatchObject({
      name: "New Comer",
      avatarUrl: "https://example.com/pic.png",
    });
  });

  // The domain isn't listed, so a closed allowlist would refuse it, but open
  // self-signup creates the user at "member".
  test("gives an unlisted email the self-signup role", async () => {
    await withSelfSignup.factory.admin.create();
    const { state, browser } = await stateFor(
      withSelfSignup,
      "google",
      "v-self",
    );
    googleAnswers(withSelfSignup, {
      sub: "google-self",
      email: "visitor@anywhere.test",
      email_verified: true,
      name: "Visitor",
      picture: null,
    });

    const page = await withSelfSignup.visit(
      `/_plumix/auth/oauth/google/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("set-cookie")).toContain("plumix_session=");
    const created = await withSelfSignup.context.db.query.users.findFirst({
      where: eq(users.email, "visitor@anywhere.test"),
    });
    expect(created?.role).toBe("member");
  });

  test("refuses an unlisted domain, creating no user and no session", async () => {
    await withEditorDomain.factory.admin.create();
    const { state, browser } = await stateFor(
      withEditorDomain,
      "google",
      "v-3",
    );
    googleAnswers(withEditorDomain, {
      sub: "g-1",
      email: "stranger@notallowed.com",
      email_verified: true,
      name: "Stranger",
      picture: null,
    });

    const page = await withEditorDomain.visit(
      `/_plumix/auth/oauth/google/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain(
      "oauth_error=domain_not_allowed",
    );
    expect(await withEditorDomain.context.db.$count(sessions)).toBe(0);
    const stranger = await withEditorDomain.context.db.query.users.findFirst({
      where: eq(users.email, "stranger@notallowed.com"),
    });
    expect(stranger).toBeUndefined();
  });

  test("logs a refused identity as sign_in_refused", async () => {
    await site.factory.admin.create();
    const { state, browser } = await stateFor(site, "google", "v-3");
    googleAnswers(site, {
      sub: "g-1",
      email: "stranger@notallowed.com",
      email_verified: true,
      name: "Stranger",
      picture: null,
    });

    await site.visit(
      `/_plumix/auth/oauth/google/callback?code=abc&state=${state}`,
      browser,
    );

    expect(site.logger.lines.filter((line) => line.level === "warn")).toEqual([
      {
        level: "warn",
        message: "sign_in_refused",
        meta: {
          method: "oauth",
          code: "domain_not_allowed",
          requestId: expect.any(String) as unknown,
        },
      },
    ]);
  });
});

describe("a github account with no public email", () => {
  test("signs up with the verified primary from /user/emails", async () => {
    await withMemberDomain.factory.admin.create();
    const { state, browser } = await stateFor(
      withMemberDomain,
      "github",
      "v-fallback",
    );
    githubAnswers(
      withMemberDomain,
      {
        id: 4242,
        login: "newcomer",
        name: "New Comer",
        email: null,
        avatar_url: null,
      },
      [{ email: "newcomer@example.com", primary: true, verified: true }],
    );

    const page = await withMemberDomain.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/_plumix/admin");
    const created = await withMemberDomain.context.db.query.users.findFirst({
      where: eq(users.email, "newcomer@example.com"),
    });
    expect(created?.role).toBe("member");
    expect(created?.emailVerifiedAt).not.toBeNull();
  });

  test("is refused when that primary is unverified", async () => {
    await withMemberDomain.factory.admin.create();
    const { state, browser } = await stateFor(
      withMemberDomain,
      "github",
      "v-fallback-unverified",
    );
    githubAnswers(
      withMemberDomain,
      { id: 4243, login: "u", name: null, email: null, avatar_url: null },
      [{ email: "u@example.com", primary: true, verified: false }],
    );

    const page = await withMemberDomain.visit(
      `/_plumix/auth/oauth/github/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.headers.get("location")).toContain(
      "oauth_error=email_unverified",
    );
  });
});

describe("a provider profile with no email", () => {
  test("is refused as email_missing", async () => {
    await site.factory.admin.create();
    const { state, browser } = await stateFor(site, "google", "v-malformed");
    site.fetch.route(
      "POST",
      "https://oauth2.googleapis.com/token",
      Response.json({ access_token: "tk", token_type: "bearer" }),
    );
    site.fetch.route(
      "GET",
      "https://openidconnect.googleapis.com/v1/userinfo",
      Response.json({ sub: "g-malformed" }),
    );

    const page = await site.visit(
      `/_plumix/auth/oauth/google/callback?code=abc&state=${state}`,
      browser,
    );

    expect(page.headers.get("location")).toContain("oauth_error=email_missing");
  });
});

describe("a failed callback under a theme login", () => {
  test("lands on the theme's login page", async () => {
    const page = await withThemeLogin.visit(
      "/_plumix/auth/oauth/github/callback?code=abc&state=nope",
      browserWith("some-nonce"),
    );

    page.assertRedirect("/account/login?oauth_error=state_expired");
  });

  test("carries the base path to the theme's login page", async () => {
    const page = await withThemeLoginUnderBasePath.visit(
      "/custom-directory/_plumix/auth/oauth/github/callback?code=abc",
      navigation,
    );

    page.assertRedirect(
      "/custom-directory/account/login?oauth_error=state_invalid",
    );
  });
});
