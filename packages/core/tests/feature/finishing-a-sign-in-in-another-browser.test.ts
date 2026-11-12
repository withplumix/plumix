import { describe, expect, test } from "vitest";

import type { OAuthProviderClient } from "../../src/auth/contract/oauth.js";
import { coreAuthMethods } from "../../src/auth/core-methods.js";
import * as builtInProviders from "../../src/auth/oauth/providers/index.js";
import { resolvePasskeyConfig } from "../../src/auth/passkey/config.js";
import { DEFAULT_SESSION_POLICY } from "../../src/auth/sessions.js";
import { sessions } from "../../src/db/schema/sessions.js";
import { testSite } from "../../src/test/site.js";

const providers: Record<string, OAuthProviderClient> = Object.fromEntries(
  Object.entries(builtInProviders).map(([key, provider]) => [
    key,
    provider({ clientId: `${key}-client`, clientSecret: `${key}-secret` }),
  ]),
);

const site = await testSite({ config: { auth: { oauth: { providers } } } });

/**
 * Why each GET route a browser reaches by redirect or link can or can't
 * finish in another browser. An unplaced new one fails the first test.
 */
const GET_ROUTES = {
  "oauth/:provider/start": "starts the sign-in; the callback finishes it",
  "oauth/:provider/callback": "finishes only in the browser that started it",
  "magic-link/verify":
    "finishes wherever the mailed link opens; holding the inbox is the proof",
};

/**
 * A browser following a link. `visit` marks a `/_plumix/` request as a fetch
 * unless it already carries the CSRF header, so this one carries it empty.
 */
const navigation = { headers: { "x-plumix-request": "" } };

/** The provider's side of a sign-in: one token, one verified profile. */
function providerAnswers(provider: OAuthProviderClient): void {
  site.fetch.route(
    "POST",
    provider.tokenUrl,
    Response.json({ access_token: "tk", token_type: "bearer" }),
  );
  // One body every built-in provider parses into a verified email.
  site.fetch.route(
    "GET",
    provider.userInfoUrl,
    Response.json({
      id: 7,
      sub: "7",
      login: "owner",
      name: "Owner",
      email: "owner@example.com",
      email_verified: true,
      avatar_url: null,
      picture: null,
    }),
  );
}

/** Starts a sign-in in one browser: its callback query and that browser's cookie. */
async function startSignIn(
  key: string,
): Promise<{ query: string; cookie: string }> {
  const start = await site.visit(
    `/_plumix/auth/oauth/${key}/start`,
    navigation,
  );
  const state = new URL(start.headers.get("location") ?? "").searchParams.get(
    "state",
  );
  const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return { query: `code=abc&state=${state ?? ""}`, cookie };
}

test("every GET route of core's sign-in methods is placed", () => {
  const methods = coreAuthMethods({
    config: site.context.config,
    passkey: resolvePasskeyConfig(site.context.config.auth.passkey),
    sessionPolicy: DEFAULT_SESSION_POLICY,
  });

  const routes = methods.flatMap((method) =>
    Object.entries(method.routes)
      .filter(([, route]) => route.method === "GET")
      .map(([path]) => `${method.name}/${path}`),
  );

  expect(routes.sort()).toEqual(Object.keys(GET_ROUTES).sort());
});

describe.each(Object.entries(providers))(
  "an oauth sign-in through %s",
  (key, provider) => {
    test("finishes in the browser that started it", async () => {
      await site.factory.admin.create({ email: "owner@example.com" });
      const { query, cookie } = await startSignIn(key);
      providerAnswers(provider);

      const callback = await site.visit(
        `/_plumix/auth/oauth/${key}/callback?${query}`,
        { headers: { ...navigation.headers, cookie } },
      );

      expect(callback.headers.get("location")).toBe("/_plumix/admin");
      expect(await site.context.db.$count(sessions)).toBe(1);
    });

    test("is refused in a browser that didn't start it", async () => {
      await site.factory.admin.create({ email: "owner@example.com" });
      const { query } = await startSignIn(key);
      providerAnswers(provider);

      const callback = await site.visit(
        `/_plumix/auth/oauth/${key}/callback?${query}`,
        navigation,
      );

      expect(callback.headers.get("location")).toContain(
        "oauth_error=state_invalid",
      );
      expect(await site.context.db.$count(sessions)).toBe(0);
      site.fetch.assertNotFetched("*");
    });

    test("is refused in a browser that started another sign-in", async () => {
      await site.factory.admin.create({ email: "owner@example.com" });
      const { query } = await startSignIn(key);
      const other = await startSignIn(key);
      providerAnswers(provider);

      const callback = await site.visit(
        `/_plumix/auth/oauth/${key}/callback?${query}`,
        { headers: { ...navigation.headers, cookie: other.cookie } },
      );

      expect(callback.headers.get("location")).toContain(
        "oauth_error=state_expired",
      );
      expect(await site.context.db.$count(sessions)).toBe(0);
      site.fetch.assertNotFetched("*");
    });
  },
);
