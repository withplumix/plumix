import type { Page } from "@playwright/test";

import { expect, test } from "@plumix/core/test/playwright";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  anonymousSession,
  AUTHED_ADMIN,
  mockRpc,
  mockRpcWithCapture,
} from "./support/rpc-mock.js";

const REQUEST = new URLSearchParams({
  response_type: "code",
  client_id: "https://agent.example/oauth/client.json",
  redirect_uri: "https://agent.example/callback",
  scope: "draft",
  state: "xyz",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  resource: "http://localhost/_plumix/mcp",
});

const CONSENT_PATH = `auth/authorize?${REQUEST.toString()}`;

function lookup(overrides: { loopbackOnly?: boolean; covered?: boolean } = {}) {
  return {
    client: {
      name: "Example Agent",
      host: "agent.example",
      logoUri: null,
      loopbackOnly: overrides.loopbackOnly ?? false,
    },
    scope: "draft",
    capabilities: ["entry:post:read", "entry:post:create"],
    covered: overrides.covered ?? false,
  };
}

/** Stands in for wherever the browser is sent next, recording that it went. */
async function answerNavigation(page: Page, pattern: string): Promise<void> {
  await page.route(pattern, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<p>ok</p>" }),
  );
}

test.describe("/auth/authorize", () => {
  test("names the client and its host, and warns when it only redirects to this machine", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/auth/oauthConsent/lookup": lookup({ loopbackOnly: true }),
    });

    await page.goto(CONSENT_PATH);

    await expect(page.getByTestId("oauth-consent-client-name")).toHaveText(
      "Example Agent",
    );
    await expect(page.getByTestId("oauth-consent-client-host")).toHaveText(
      "agent.example",
    );
    await expect(
      page.getByTestId("oauth-consent-loopback-warning"),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("approving sends only the capabilities left ticked, then returns the browser to the client", async ({
    page,
  }) => {
    const approves = await mockRpcWithCapture(page, {
      captureSuffix: "/auth/oauthConsent/approve",
      captureResponse: {
        redirectTo: "https://agent.example/callback?code=abc&state=xyz",
      },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/auth/oauthConsent/lookup": lookup(),
      },
    });
    await answerNavigation(page, "https://agent.example/**");
    await page.goto(CONSENT_PATH);

    await page
      .getByTestId("oauth-consent-capability-entry:post:create")
      .click();
    await page.getByTestId("oauth-consent-approve-button").click();

    await expect(page).toHaveURL(
      "https://agent.example/callback?code=abc&state=xyz",
    );
    expect(approves[0]).toMatchObject({
      client_id: "https://agent.example/oauth/client.json",
      scope: "draft",
      capabilities: ["entry:post:read"],
    });
  });

  test("a request the person's grant already covers goes back to /authorize without asking", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/auth/oauthConsent/lookup": lookup({ covered: true }),
    });
    await answerNavigation(page, "**/_plumix/oauth/authorize?**");

    await page.goto(CONSENT_PATH);

    await expect(page).toHaveURL(
      new RegExp(`/_plumix/oauth/authorize\\?.*scope=draft`),
    );
    expect(new URL(page.url()).searchParams.get("client_id")).toBe(
      REQUEST.get("client_id"),
    );
  });
});

test.describe("/auth/authorize signed out", () => {
  const SIGN_IN_METHODS = {
    methods: [
      { name: "passkey", label: "Passkey" },
      { name: "magic-link", label: "Magic link" },
      { name: "oauth", label: "OAuth" },
    ],
    oauth: [{ key: "github", label: "GitHub" }],
  };

  function returnPathOf(url: string): string | null {
    return new URL(url, "http://localhost").searchParams.get("redirectTo");
  }

  test("signing in with an OAuth provider comes back to the consent page", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": anonymousSession(),
      "/auth/signInMethods": SIGN_IN_METHODS,
    });

    await page.goto(CONSENT_PATH);
    const href = await page
      .getByTestId("login-oauth-github")
      .getAttribute("href");

    const back = returnPathOf(href ?? "");
    expect(back?.startsWith("/_plumix/admin/auth/authorize?")).toBe(true);
    expect(
      new URL(back ?? "", "http://localhost").searchParams.get("client_id"),
    ).toBe(REQUEST.get("client_id"));
  });

  test("a magic link comes back to the consent page", async ({ page }) => {
    await mockRpc(page, {
      "/auth/session": anonymousSession(),
      "/auth/signInMethods": SIGN_IN_METHODS,
    });
    const requested: string[] = [];
    await page.route("**/_plumix/auth/magic-link/request**", (route) => {
      requested.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, message: "sent" }),
      });
    });

    await page.goto(CONSENT_PATH);
    await page.getByTestId("login-email-input").fill("editor@example.test");
    await page.getByTestId("login-magic-link-submit").click();

    await expect.poll(() => requested.length).toBe(1);
    expect(
      returnPathOf(requested[0] ?? "")?.startsWith(
        "/_plumix/admin/auth/authorize?",
      ),
    ).toBe(true);
  });
});
