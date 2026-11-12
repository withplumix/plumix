import { describe, expect, test } from "vitest";

import { github } from "../../src/auth/oauth/providers/github.js";
import { google } from "../../src/auth/oauth/providers/google.js";
import { authTokens } from "../../src/db/schema/auth_tokens.js";
import { testSite } from "../../src/test/site.js";

const providers = {
  github: github({ clientId: "gh-client", clientSecret: "gh-secret" }),
  google: google({ clientId: "gg-client", clientSecret: "gg-secret" }),
};

const site = await testSite({ config: { auth: { oauth: { providers } } } });
const underBasePath = await testSite({
  config: { basePath: "/custom-directory", auth: { oauth: { providers } } },
});
const underBlog = await testSite({
  config: { basePath: "/blog", auth: { oauth: { providers } } },
});
const openToTheFirstMethod = await testSite({
  config: { auth: { oauth: { providers }, bootstrapVia: "first-method-wins" } },
});
const withEnvClient = await testSite({
  env: { GH_ID: "gh-from-env", GH_SECRET: "secret-from-env" },
  config: {
    auth: {
      oauth: {
        providers: {
          github: github((env) => ({
            clientId: (env as { GH_ID?: string }).GH_ID ?? "",
            clientSecret: (env as { GH_SECRET?: string }).GH_SECRET ?? "",
          })),
        },
      },
    },
  },
});
const withoutOAuth = await testSite({ plugins: [] });

/**
 * A browser following a link. `visit` marks a `/_plumix/` request as a fetch
 * unless it already carries the CSRF header, so this one carries it empty.
 */
const navigation = { headers: { "x-plumix-request": "" } };

async function storedRedirectTo(on: typeof site): Promise<string | undefined> {
  const rows = await on.context.db.select().from(authTokens);
  const stateRow = rows.find((row) => row.type === "oauth_state");
  const payload = stateRow?.payload as { redirectTo?: string } | undefined;
  return payload?.redirectTo;
}

describe("starting an oauth sign-in", () => {
  test("sends a site with no users to the bootstrap page", async () => {
    const page = await site.visit(
      "/_plumix/auth/oauth/github/start",
      navigation,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/_plumix/admin/bootstrap");
  });

  test("lets a site with no users start when the first method wins", async () => {
    const page = await openToTheFirstMethod.visit(
      "/_plumix/auth/oauth/github/start",
      navigation,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain(
      "github.com/login/oauth/authorize",
    );
  });

  test("redirects to the provider's authorize URL with PKCE and state", async () => {
    await site.factory.admin.create();

    const page = await site.visit(
      "/_plumix/auth/oauth/github/start",
      navigation,
    );

    expect(page.status).toBe(302);
    const url = new URL(page.headers.get("location") ?? "");
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
    const rows = await site.context.db.select().from(authTokens);
    expect(rows.map((row) => row.type)).toContain("oauth_state");
  });

  test("holds the sign-in's browser in a short-lived cookie the callback reads", async () => {
    await site.factory.admin.create();

    const page = await site.visit(
      "/_plumix/auth/oauth/github/start",
      navigation,
    );

    expect(page.headers.get("set-cookie")).toMatch(
      /^plumix_oauth_state=[\w-]+; Path=\/_plumix\/auth\/oauth\/github; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/,
    );
  });

  test("leaves Secure off the cookie over plain http", async () => {
    await site.factory.admin.create();

    const page = await site.visit(
      "http://cms.example/_plumix/auth/oauth/github/start",
      navigation,
    );

    expect(page.headers.get("set-cookie")).toContain("plumix_oauth_state=");
    expect(page.headers.get("set-cookie")).not.toContain("Secure");
  });

  test("scopes the cookie to the base path", async () => {
    await underBasePath.factory.admin.create();

    const page = await underBasePath.visit(
      "/custom-directory/_plumix/auth/oauth/github/start",
      navigation,
    );

    expect(page.headers.get("set-cookie")).toContain(
      "Path=/custom-directory/_plumix/auth/oauth/github;",
    );
  });

  test("carries the base path in the redirect_uri", async () => {
    await underBasePath.factory.admin.create();

    const page = await underBasePath.visit(
      "/custom-directory/_plumix/auth/oauth/github/start",
      navigation,
    );

    expect(page.status).toBe(302);
    // The redirect_uri the IdP will bounce back to must include the base, or
    // the callback 404s as outside-the-base.
    const url = new URL(page.headers.get("location") ?? "");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://cms.example/custom-directory/_plumix/auth/oauth/github/callback",
    );
  });

  test("resolves an (env) => client config from the request env", async () => {
    await withEnvClient.factory.admin.create();

    const page = await withEnvClient.visit(
      "/_plumix/auth/oauth/github/start",
      navigation,
    );

    const url = new URL(page.headers.get("location") ?? "");
    expect(url.searchParams.get("client_id")).toBe("gh-from-env");
  });

  test("sends a site with no oauth to the login page", async () => {
    await withoutOAuth.factory.admin.create();

    const page = await withoutOAuth.visit(
      "/_plumix/auth/oauth/github/start",
      navigation,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain(
      "/_plumix/admin/login?oauth_error=provider_not_configured",
    );
  });

  test("sends an unknown provider to the login page", async () => {
    const page = await site.visit(
      "/_plumix/auth/oauth/twitter/start",
      navigation,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain(
      "oauth_error=provider_not_configured",
    );
  });

  test("sends a malformed provider key to the login page", async () => {
    const page = await site.visit(
      "/_plumix/auth/oauth/Bad-Key!/start",
      navigation,
    );

    page.assertRedirect(
      "/_plumix/admin/login?oauth_error=provider_not_configured",
    );
    expect(page.status).toBe(302);
  });

  // The path pattern accepts `constructor`, which a plain `providers[key]`
  // lookup would resolve through the prototype chain.
  test("treats `constructor` as a provider that isn't configured", async () => {
    await site.factory.admin.create();

    const page = await site.visit(
      "/_plumix/auth/oauth/constructor/start",
      navigation,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain(
      "oauth_error=provider_not_configured",
    );
  });

  test("answers 405 to a POST", async () => {
    const page = await site.visit("/_plumix/auth/oauth/github/start", {
      method: "POST",
    });

    expect(page.status).toBe(405);
  });

  test("answers 405 to a POST for a malformed provider key", async () => {
    const page = await site.visit("/_plumix/auth/oauth/Bad-Key!/start", {
      method: "POST",
    });

    expect(page.status).toBe(405);
    page.assertHeader("allow", "GET");
  });
});

describe("the page an oauth sign-in returns to", () => {
  test("is a safe redirectTo, kept in the state", async () => {
    await site.factory.admin.create();

    const page = await site.visit(
      "/_plumix/auth/oauth/github/start?redirectTo=%2Faccount%2Fsaved",
      navigation,
    );

    expect(page.status).toBe(302);
    expect(await storedRedirectTo(site)).toBe("/account/saved");
  });

  test("is the site root for an unsafe redirectTo", async () => {
    await site.factory.admin.create();

    await site.visit(
      "/_plumix/auth/oauth/github/start?redirectTo=https%3A%2F%2Fevil.com",
      navigation,
    );

    expect(await storedRedirectTo(site)).toBe("/");
  });

  // `/%09/evil.com` decodes to `/<TAB>/evil.com`; the browser's URL parser
  // strips the TAB, reconstructing `//evil.com`.
  test("is the site root for a TAB-smuggled protocol-relative redirectTo", async () => {
    await site.factory.admin.create();

    await site.visit(
      "/_plumix/auth/oauth/github/start?redirectTo=%2F%09%2Fevil.com",
      navigation,
    );

    expect(await storedRedirectTo(site)).toBe("/");
  });

  test("is the base path for a redirectTo outside it", async () => {
    await underBlog.factory.admin.create();

    await underBlog.visit(
      "/blog/_plumix/auth/oauth/github/start?redirectTo=%2Fother",
      navigation,
    );

    expect(await storedRedirectTo(underBlog)).toBe("/blog/");
  });
});
