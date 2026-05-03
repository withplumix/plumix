import { expect, test } from "@playwright/test";

import { AUTHED_ADMIN, rpcOkBody } from "./support/rpc-mock.js";

// /auth/device covers the RFC 8628 admin-side approval page:
//   - manual lookup → approve flow with default scopes
//   - approve with restrict-scope textarea posts the parsed array
//   - deny button posts to deviceFlow.deny + surfaces the denied alert
//   - landing with `?user_code=...` skips the lookup form
//   - lookup of a non-existent code surfaces "Code not found"
//   - lookup of an expired code surfaces "expired" copy

test.describe("/auth/device", () => {
  test("manual lookup → approve happy path", async ({ page }) => {
    const approves: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/auth/deviceFlow/lookup")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ ok: true }),
        });
      }
      if (url.endsWith("/auth/deviceFlow/approve")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        approves.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ ok: true }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
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
    const approves: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/auth/deviceFlow/lookup")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ ok: true }),
        });
      }
      if (url.endsWith("/auth/deviceFlow/approve")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        approves.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ ok: true }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
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
    const denies: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/auth/deviceFlow/lookup")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ ok: true }),
        });
      }
      if (url.endsWith("/auth/deviceFlow/deny")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        denies.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ ok: true }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("auth/device?user_code=ABCD-EFGH");
    await expect(page.getByTestId("auth-device-tokenname-input")).toBeVisible();
    await page.getByTestId("auth-device-deny-button").click();

    await expect(page.getByTestId("auth-device-denied-alert")).toBeVisible();
    expect(denies[0]).toMatchObject({ userCode: "ABCD-EFGH" });
  });

  test("not-found code surfaces actionable error copy", async ({ page }) => {
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/auth/deviceFlow/lookup")) {
        return route.fulfill({
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
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("auth/device");
    await page.getByTestId("auth-device-usercode-input").fill("ZZZZ-ZZZZ");
    await page.getByTestId("auth-device-lookup-submit").click();

    await expect(page.getByTestId("auth-device-lookup-error")).toContainText(
      "Code not found",
    );
  });

  test("expired code surfaces actionable error copy", async ({ page }) => {
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/auth/deviceFlow/lookup")) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              defined: true,
              code: "CONFLICT",
              status: 409,
              message: "Resource conflict",
              data: { reason: "expired" },
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("auth/device");
    await page.getByTestId("auth-device-usercode-input").fill("ABCD-EFGH");
    await page.getByTestId("auth-device-lookup-submit").click();

    await expect(page.getByTestId("auth-device-lookup-error")).toContainText(
      "expired",
    );
  });
});
