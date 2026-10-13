import type { User } from "@plumix/core/schema";
import { expect, test } from "@plumix/core/test/playwright";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  anonymousSession,
  AUTHED_ADMIN,
  mockManifest,
  mockRpc,
  mockRpcWithCapture,
  mockSession,
  rpcConflictBody,
  rpcOkBody,
} from "./support/rpc-mock.js";

test.describe("/bootstrap", () => {
  test("renders first-admin form with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockSession(page, anonymousSession(true));
    await page.goto("bootstrap");
    await expect(page.getByTestId("bootstrap-heading")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("/login", () => {
  test("renders sign-in form with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockSession(page, anonymousSession());
    await page.goto("login");
    await expect(page.getByTestId("login-heading")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("picking a language reloads the sign-in form in it and keeps it on the next visit", async ({
    page,
  }) => {
    // Stands in for the server's locale resolution, which `vite preview`
    // lacks: `?lang=`, then the cookie. Set as parsing ends, before the
    // admin's module script reads `<html lang>`.
    await page.addInitScript(() => {
      document.addEventListener(
        "readystatechange",
        () => {
          const lang =
            new URL(location.href).searchParams.get("lang") ??
            /(?:^|; )plumix_locale=([^;]+)/.exec(document.cookie)?.[1];
          if (lang) document.documentElement.lang = lang;
        },
        { once: true },
      );
    });
    await mockManifest(page, {
      i18n: {
        defaultLocale: "en",
        locales: [
          { code: "en", label: "English", direction: "ltr", enabled: true },
          { code: "de", label: "Deutsch", direction: "ltr", enabled: true },
        ],
      },
    });
    await mockSession(page, anonymousSession());
    await page.goto("login");
    await expect(page.getByTestId("login-heading")).toHaveText("Sign in");

    await page.getByTestId("login-locale-switcher-trigger").click();
    await page.getByTestId("login-locale-switcher-option-de").click();
    await expect(page.getByTestId("login-heading")).toHaveText("Anmelden");

    await page.goto("login");
    await expect(page.getByTestId("login-heading")).toHaveText("Anmelden");
  });

  test("?email_change_success=1 renders the success alert", async ({
    page,
  }) => {
    await mockSession(page, anonymousSession());
    await page.goto("login?email_change_success=1");
    await expect(page.getByTestId("login-email-change-success")).toContainText(
      "Email confirmed",
    );
  });

  test("?magic_link_sent=1 renders the sent card", async ({ page }) => {
    await mockSession(page, anonymousSession());
    await page.goto("login?magic_link_sent=1");
    await expect(page.getByTestId("login-magic-link-sent")).toContainText(
      "Check your email",
    );
  });

  test("?email_change_error=token_expired renders friendly copy", async ({
    page,
  }) => {
    await mockSession(page, anonymousSession());
    await page.goto("login?email_change_error=token_expired");
    await expect(page.getByTestId("login-email-change-error")).toContainText(
      "expired",
    );
  });

  test("?email_change_error=email_taken renders friendly copy", async ({
    page,
  }) => {
    await mockSession(page, anonymousSession());
    await page.goto("login?email_change_error=email_taken");
    await expect(page.getByTestId("login-email-change-error")).toContainText(
      "claimed that email",
    );
  });
});

test.describe("/auth/device", () => {
  test("manual lookup → approve happy path", async ({ page }) => {
    const approves = await mockRpcWithCapture(page, {
      captureSuffix: "/auth/deviceFlow/approve",
      captureResponse: { ok: true },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/auth/deviceFlow/lookup": { ok: true },
      },
    });

    await page.goto("auth/device");
    await page.getByTestId("auth-device-usercode-input").fill("ABCD-EFGH");
    await page.getByTestId("auth-device-lookup-submit").click();

    await expect(page.getByTestId("auth-device-tokenname-input")).toBeVisible();
    await page.getByTestId("auth-device-tokenname-input").fill("claude-code");
    await page.getByTestId("auth-device-approve-button").click();

    await expect(page.getByTestId("auth-device-approved-alert")).toBeVisible();
    expect(approves[0]).toMatchObject({
      userCode: "ABCD-EFGH",
      tokenName: "claude-code",
      scopes: null,
    });
  });

  test("restrict scopes posts the textarea-parsed array", async ({ page }) => {
    const approves = await mockRpcWithCapture(page, {
      captureSuffix: "/auth/deviceFlow/approve",
      captureResponse: { ok: true },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/auth/deviceFlow/lookup": { ok: true },
      },
    });

    // Land with prefilled code via `?user_code=…` (the
    // verification_uri_complete shape the RFC describes).
    await page.goto("auth/device?user_code=ABCD-EFGH");

    await expect(page.getByTestId("auth-device-tokenname-input")).toBeVisible();
    await page.getByTestId("auth-device-tokenname-input").fill("scoped-cli");
    await page.getByTestId("auth-device-scope-restrict-radio").click();
    await page
      .getByTestId("auth-device-scopes-textarea")
      .fill("entry:post:read\nsettings:manage\n");
    await page.getByTestId("auth-device-approve-button").click();

    await expect(page.getByTestId("auth-device-approved-alert")).toBeVisible();
    expect(approves[0]).toMatchObject({
      userCode: "ABCD-EFGH",
      tokenName: "scoped-cli",
      scopes: ["entry:post:read", "settings:manage"],
    });
  });

  test("deny button surfaces denied alert + posts to deviceFlow.deny", async ({
    page,
  }) => {
    const denies = await mockRpcWithCapture(page, {
      captureSuffix: "/auth/deviceFlow/deny",
      captureResponse: { ok: true },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/auth/deviceFlow/lookup": { ok: true },
      },
    });

    await page.goto("auth/device?user_code=ABCD-EFGH");
    await expect(page.getByTestId("auth-device-tokenname-input")).toBeVisible();
    await page.getByTestId("auth-device-deny-button").click();

    await expect(page.getByTestId("auth-device-denied-alert")).toBeVisible();
    expect(denies[0]).toMatchObject({ userCode: "ABCD-EFGH" });
  });

  test("not-found code surfaces actionable error copy", async ({ page }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/auth/deviceFlow/lookup", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          json: {
            defined: true,
            code: "NOT_FOUND",
            status: 404,
            message: "Resource not found",
            data: { kind: "device_code", id: "ZZZZ-ZZZZ" },
          },
          meta: [],
        }),
      }),
    );

    await page.goto("auth/device");
    await page.getByTestId("auth-device-usercode-input").fill("ZZZZ-ZZZZ");
    await page.getByTestId("auth-device-lookup-submit").click();

    await expect(page.getByTestId("auth-device-lookup-error")).toContainText(
      "Code not found",
    );
  });

  test("expired code surfaces actionable error copy", async ({ page }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/auth/deviceFlow/lookup", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: rpcConflictBody("expired"),
      }),
    );

    await page.goto("auth/device");
    await page.getByTestId("auth-device-usercode-input").fill("ABCD-EFGH");
    await page.getByTestId("auth-device-lookup-submit").click();

    await expect(page.getByTestId("auth-device-lookup-error")).toContainText(
      "expired",
    );
  });
});

const ADMIN: User = {
  id: 1,
  slug: "admin",
  email: "admin@example.test",
  name: "Admin",
  avatarUrl: null,
  role: "admin",
  meta: {},
  emailVerifiedAt: new Date("2026-04-20T00:00:00Z"),
  disabledAt: null,
  createdAt: new Date("2026-04-20T00:00:00Z"),
  updatedAt: new Date("2026-04-20T00:00:00Z"),
};

test.describe("passkeys", () => {
  test("an admin who adds a passkey signs back in with it", async ({
    page,
    passkey,
  }) => {
    let signedIn = true;
    let signedInWith: string | undefined;
    await mockRpc(page, {
      "/user/get": ADMIN,
      "/auth/credentials/list": [],
      "/auth/sessions/list": [],
      "/auth/apiTokens/list": [],
      "/entry/stats": [],
      "/entry/recentActivity": [],
    });
    await page.route("**/_plumix/rpc/auth/session", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: rpcOkBody(signedIn ? AUTHED_ADMIN : anonymousSession()),
      }),
    );
    // The server's half of each ceremony; the browser's half runs for real
    // against the virtual authenticator, which checks the origin's rp id.
    await page.route("**/_plumix/auth/passkey/register/options", (route) =>
      route.fulfill({
        json: {
          rp: { id: "localhost", name: "Plumix" },
          user: { id: "dXNlci0x", name: ADMIN.email, displayName: "Admin" },
          challenge: "cmVnaXN0ZXItY2hhbGxlbmdl",
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "preferred",
          },
          attestation: "none",
        },
      }),
    );
    await page.route("**/_plumix/auth/passkey/register/verify", (route) =>
      route.fulfill({ json: { userId: 1 } }),
    );
    await page.route("**/_plumix/auth/signout", (route) => {
      signedIn = false;
      return route.fulfill({ json: { ok: true, redirectTo: null } });
    });
    await page.route("**/_plumix/auth/passkey/login/options", (route) =>
      route.fulfill({
        json: {
          rpId: "localhost",
          challenge: "c2lnbi1pbi1jaGFsbGVuZ2U",
          userVerification: "preferred",
        },
      }),
    );
    await page.route("**/_plumix/auth/passkey/login/verify", (route) => {
      signedInWith = (route.request().postDataJSON() as { rawId: string })
        .rawId;
      signedIn = true;
      return route.fulfill({ json: { userId: 1 } });
    });

    await page.goto("profile");
    await page.getByTestId("profile-passkeys-enroll-button").click();
    await expect.poll(() => passkey.credentials()).toHaveLength(1);

    await page.getByTestId("user-menu-trigger").click();
    await page.getByTestId("user-menu-sign-out").click();
    await expect(page.getByTestId("login-heading")).toBeVisible();
    await page.getByTestId("login-passkey-submit").click();

    await expect(page.getByTestId("dashboard-welcome-heading")).toBeVisible();
    const [stored] = await passkey.credentials();
    // CDP reports the raw id in base64; the ceremony posts it in base64url.
    expect(signedInWith).toBe(
      Buffer.from(stored?.credentialId ?? "", "base64").toString("base64url"),
    );
  });
});
