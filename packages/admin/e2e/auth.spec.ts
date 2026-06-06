// Every unauthenticated/auth surface in one suite: bootstrap (first
// admin ever), login (returning user + email-change feedback params),
// and the RFC 8628 device-grant approval page. Accept-invite
// end-to-end requires mocked WebAuthn — the unit-level coverage in
// `src/lib/passkey.test.ts` handles the shape contract today; a full
// e2e is a follow-up when we have passkey test infra.

import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  anonymousSession,
  AUTHED_ADMIN,
  mockRpc,
  mockRpcWithCapture,
  mockSession,
  rpcConflictBody,
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

  test("?email_change_success=1 renders the success alert", async ({
    page,
  }) => {
    await mockSession(page, anonymousSession());
    await page.goto("login?email_change_success=1");
    await expect(page.getByTestId("login-email-change-success")).toContainText(
      "Email confirmed",
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
