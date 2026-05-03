import { expect, test } from "@playwright/test";

import type { User } from "@plumix/core/schema";

import { AUTHED_ADMIN, mockRpc, rpcOkBody } from "./support/rpc-mock.js";

// /users/$id/edit + login surfaces for the email-change flow.
// Coverage map:
//   - self profile: change request happy path → success message
//   - admin editing other: change request → confirmation goes to new email
//   - email-taken CONFLICT renders friendly error
//   - pending request banner + cancel button
//   - login screen: success/error feedback rendered from URL params

function user(overrides: Partial<User> & { id: number; email: string }): User {
  return {
    name: null,
    avatarUrl: null,
    role: "subscriber",
    meta: {},
    emailVerifiedAt: new Date("2026-04-20T00:00:00Z"),
    disabledAt: null,
    createdAt: new Date("2026-04-20T00:00:00Z"),
    updatedAt: new Date("2026-04-20T00:00:00Z"),
    ...overrides,
  };
}

test.describe("/users/$id/edit — email change (self)", () => {
  test("requesting a change shows the success copy + posts to requestEmailChange", async ({
    page,
  }) => {
    const inputs: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/user/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(
            user({ id: 1, email: "admin@example.test", role: "admin" }),
          ),
        });
      }
      if (url.endsWith("/user/pendingEmailChange")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ pending: null }),
        });
      }
      if (
        url.endsWith("/auth/credentials/list") ||
        url.endsWith("/auth/sessions/list") ||
        url.endsWith("/auth/apiTokens/list")
      ) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody([]),
        });
      }
      if (url.endsWith("/user/requestEmailChange")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        inputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({
            ok: true,
            expiresAt: new Date("2026-05-04T00:00:00Z"),
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("users/1/edit");
    await page.getByTestId("user-edit-email-change-button").click();
    await expect(
      page.getByTestId("user-edit-email-change-dialog"),
    ).toBeVisible();
    await page
      .getByTestId("user-edit-email-change-input")
      .fill("admin-new@example.test");
    await page.getByTestId("user-edit-email-change-submit").click();

    await expect(
      page.getByTestId("user-edit-email-change-success"),
    ).toContainText("admin-new@example.test");

    expect(inputs[0]).toMatchObject({
      id: 1,
      newEmail: "admin-new@example.test",
    });
  });

  test("email-taken CONFLICT renders a friendly error inside the dialog", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/user/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(
            user({ id: 1, email: "admin@example.test", role: "admin" }),
          ),
        });
      }
      if (url.endsWith("/user/pendingEmailChange")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ pending: null }),
        });
      }
      if (
        url.endsWith("/auth/credentials/list") ||
        url.endsWith("/auth/sessions/list") ||
        url.endsWith("/auth/apiTokens/list")
      ) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody([]),
        });
      }
      if (url.endsWith("/user/requestEmailChange")) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              defined: true,
              code: "CONFLICT",
              status: 409,
              message: "Resource conflict",
              data: { reason: "email_taken" },
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("users/1/edit");
    await page.getByTestId("user-edit-email-change-button").click();
    await page
      .getByTestId("user-edit-email-change-input")
      .fill("taken@example.test");
    await page.getByTestId("user-edit-email-change-submit").click();

    await expect(
      page.getByTestId("user-edit-email-change-error"),
    ).toContainText("already in use");
    // Dialog stays open so the user can retype.
    await expect(
      page.getByTestId("user-edit-email-change-dialog"),
    ).toBeVisible();
  });

  test("pending change banner renders + cancel works", async ({ page }) => {
    let cancelled = false;
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/user/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(
            user({ id: 1, email: "admin@example.test", role: "admin" }),
          ),
        });
      }
      if (url.endsWith("/user/pendingEmailChange")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(
            cancelled
              ? { pending: null }
              : {
                  pending: {
                    newEmail: "admin-new@example.test",
                    expiresAt: new Date("2026-05-04T00:00:00Z"),
                    createdAt: new Date("2026-05-03T00:00:00Z"),
                  },
                },
          ),
        });
      }
      if (
        url.endsWith("/auth/credentials/list") ||
        url.endsWith("/auth/sessions/list") ||
        url.endsWith("/auth/apiTokens/list")
      ) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody([]),
        });
      }
      if (url.endsWith("/user/cancelEmailChange")) {
        cancelled = true;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ cancelled: 1 }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("users/1/edit");
    await expect(page.getByTestId("user-edit-email-pending")).toContainText(
      "admin-new@example.test",
    );
    await page.getByTestId("user-edit-email-cancel-pending").click();
    await expect(page.getByTestId("user-edit-email-pending")).toHaveCount(0);
  });
});

test.describe("/users/$id/edit — email change (admin editing other)", () => {
  test("admin requests change for another user; sends to new email", async ({
    page,
  }) => {
    const inputs: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/user/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(
            user({
              id: 42,
              email: "victim@example.test",
              name: "Victim",
              role: "editor",
            }),
          ),
        });
      }
      if (url.endsWith("/user/pendingEmailChange")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ pending: null }),
        });
      }
      if (url.endsWith("/auth/apiTokens/adminList")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ items: [], total: 0, limit: 50, offset: 0 }),
        });
      }
      if (url.endsWith("/user/requestEmailChange")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        inputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({
            ok: true,
            expiresAt: new Date("2026-05-04T00:00:00Z"),
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("users/42/edit");
    await page.getByTestId("user-edit-email-change-button").click();
    await page
      .getByTestId("user-edit-email-change-input")
      .fill("newvictim@example.test");
    await page.getByTestId("user-edit-email-change-submit").click();

    await expect(
      page.getByTestId("user-edit-email-change-success"),
    ).toContainText("newvictim@example.test");
    expect(inputs[0]).toMatchObject({
      id: 42,
      newEmail: "newvictim@example.test",
    });
  });
});

test.describe("login screen — email change feedback", () => {
  test("?email_change_success=1 renders the success alert", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": { user: null, needsBootstrap: false },
    });
    await page.goto("login?email_change_success=1");
    await expect(page.getByTestId("login-email-change-success")).toContainText(
      "Email confirmed",
    );
  });

  test("?email_change_error=token_expired renders friendly copy", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": { user: null, needsBootstrap: false },
    });
    await page.goto("login?email_change_error=token_expired");
    await expect(page.getByTestId("login-email-change-error")).toContainText(
      "expired",
    );
  });

  test("?email_change_error=email_taken renders friendly copy", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": { user: null, needsBootstrap: false },
    });
    await page.goto("login?email_change_error=email_taken");
    await expect(page.getByTestId("login-email-change-error")).toContainText(
      "claimed that email",
    );
  });
});
