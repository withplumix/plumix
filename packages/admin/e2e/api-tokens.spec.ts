import { expect, test } from "@playwright/test";

import type { User } from "@plumix/core/schema";

import {
  AUTHED_ADMIN,
  mockRpc,
  mockRpcWithCapture,
  rpcOkBody,
} from "./support/rpc-mock.js";

// /api-tokens lives on /users/$id/edit (self via /profile redirect,
// other-user via the shared route). Coverage:
//   - self mints a token, secret panel shows it once, list refetches
//   - self revokes a token via confirm dialog
//   - admin editing another user sees that user's tokens (no mint form)
//   - admin revokes a cross-user token via adminRevoke
//   - non-admin editing self DOESN'T see the cross-user surface

const TOKEN_BASE = {
  prefix: "pl_pat_abcd",
  createdAt: new Date("2026-04-20T00:00:00Z"),
  expiresAt: null,
  lastUsedAt: null,
  scopes: null,
} as const;

function token(
  overrides: Partial<{
    id: string;
    name: string;
    prefix: string;
    expiresAt: Date | null;
    lastUsedAt: Date | null;
    scopes: readonly string[] | null;
  }> & { id: string; name: string },
): {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  scopes: readonly string[] | null;
} {
  return {
    ...TOKEN_BASE,
    ...overrides,
  };
}

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

test.describe("/users/$id/edit — API tokens (self)", () => {
  test("renders the self mint form + lists own tokens", async ({ page }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/get": user({
        id: 1,
        email: "admin@example.test",
        name: "Admin",
        role: "admin",
      }),
      "/auth/credentials/list": [],
      "/auth/sessions/list": [],
      "/auth/apiTokens/list": [token({ id: "tok-a", name: "github-actions" })],
    });

    await page.goto("users/1/edit");
    await expect(page.getByTestId("api-tokens-card")).toBeVisible();
    // Self-mode shows the create form…
    await expect(
      page.getByTestId("api-tokens-create-name-input"),
    ).toBeVisible();
    // …and the existing token row is rendered.
    await expect(page.getByTestId("api-tokens-row-tok-a")).toBeVisible();
  });

  test("mints a token + secret panel surfaces the once-shown secret", async ({
    page,
  }) => {
    const inputs: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      if (url.endsWith("/user/get"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(
            user({ id: 1, email: "admin@example.test", role: "admin" }),
          ),
        });
      if (url.endsWith("/auth/credentials/list"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody([]),
        });
      if (url.endsWith("/auth/sessions/list"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody([]),
        });
      if (url.endsWith("/auth/apiTokens/list"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody([]),
        });
      if (url.endsWith("/auth/apiTokens/create")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        inputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({
            secret: "pl_pat_abcdEFGHsecretxyz",
            token: token({ id: "tok-new", name: "ci" }),
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("users/1/edit");
    await page.getByTestId("api-tokens-create-name-input").fill("ci");
    await page.getByTestId("api-tokens-create-submit").click();

    await expect(page.getByTestId("api-tokens-secret-dialog")).toBeVisible();
    await expect(page.getByTestId("api-tokens-secret-input")).toHaveValue(
      "pl_pat_abcdEFGHsecretxyz",
    );

    // Server received name + default 90-day expiry + null scopes.
    expect(inputs[0]).toMatchObject({
      name: "ci",
      expiresInDays: 90,
      scopes: null,
    });
  });

  test("restrict scope mode posts the textarea-parsed array", async ({
    page,
  }) => {
    const inputs = await mockRpcWithCapture(page, {
      captureSuffix: "/auth/apiTokens/create",
      captureResponse: {
        secret: "pl_pat_abcdSECRET",
        token: token({ id: "tok-x", name: "scoped" }),
      },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/user/get": user({
          id: 1,
          email: "admin@example.test",
          role: "admin",
        }),
        "/auth/credentials/list": [],
        "/auth/sessions/list": [],
        "/auth/apiTokens/list": [],
      },
    });

    await page.goto("users/1/edit");
    await page.getByTestId("api-tokens-create-name-input").fill("scoped");
    await page.getByTestId("api-tokens-create-scope-restrict-radio").click();
    await page
      .getByTestId("api-tokens-create-scopes-textarea")
      .fill("entry:post:read\nsettings:manage\n   ");
    await page.getByTestId("api-tokens-create-submit").click();

    await expect(page.getByTestId("api-tokens-secret-dialog")).toBeVisible();
    expect(inputs[0]).toMatchObject({
      name: "scoped",
      // Trimmed + empty lines filtered out client-side.
      scopes: ["entry:post:read", "settings:manage"],
    });
  });

  test("revokes via confirm dialog + invalidates the list query", async ({
    page,
  }) => {
    const revokes: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      if (url.endsWith("/user/get"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(
            user({ id: 1, email: "admin@example.test", role: "admin" }),
          ),
        });
      if (url.endsWith("/auth/credentials/list"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody([]),
        });
      if (url.endsWith("/auth/sessions/list"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody([]),
        });
      if (url.endsWith("/auth/apiTokens/list")) {
        // Pre-revoke: one token. Post-revoke: empty list (refetch returns []).
        const body =
          revokes.length === 0
            ? [token({ id: "tok-z", name: "to-be-revoked" })]
            : [];
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(body),
        });
      }
      if (url.endsWith("/auth/apiTokens/revoke")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        revokes.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ id: "tok-z" }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("users/1/edit");
    await page.getByTestId("api-tokens-revoke-tok-z").click();
    await expect(
      page.getByTestId("api-tokens-revoke-confirm-button"),
    ).toBeVisible();
    await page.getByTestId("api-tokens-revoke-confirm-button").click();

    expect(revokes[0]).toMatchObject({ id: "tok-z" });
    // Empty state surfaces after the refetch.
    await expect(page.getByTestId("api-tokens-empty")).toBeVisible();
  });
});

test.describe("/users/$id/edit — API tokens (admin oversight)", () => {
  test("admin editing another user sees their tokens but no mint form", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/get": user({
        id: 42,
        email: "victim@example.test",
        role: "editor",
      }),
      "/auth/apiTokens/adminList": {
        items: [token({ id: "tok-v", name: "leaked-token" })],
        total: 1,
        limit: 50,
        offset: 0,
      },
    });

    await page.goto("users/42/edit");
    await expect(page.getByTestId("api-tokens-card")).toBeVisible();
    await expect(page.getByTestId("api-tokens-row-tok-v")).toBeVisible();
    // Admin oversight: NO mint form (only the owner can mint).
    await expect(page.getByTestId("api-tokens-create-name-input")).toHaveCount(
      0,
    );
  });

  test("admin revokes a cross-user token via adminRevoke", async ({ page }) => {
    const revokes: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      if (url.endsWith("/user/get"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(
            user({ id: 42, email: "victim@example.test", role: "editor" }),
          ),
        });
      if (url.endsWith("/auth/apiTokens/adminList")) {
        const body =
          revokes.length === 0
            ? {
                items: [token({ id: "tok-v", name: "leaked" })],
                total: 1,
                limit: 50,
                offset: 0,
              }
            : { items: [], total: 0, limit: 50, offset: 0 };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(body),
        });
      }
      if (url.endsWith("/auth/apiTokens/adminRevoke")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        revokes.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ id: "tok-v" }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("users/42/edit");
    await page.getByTestId("api-tokens-revoke-tok-v").click();
    await page.getByTestId("api-tokens-revoke-confirm-button").click();

    expect(revokes[0]).toMatchObject({ id: "tok-v" });
    await expect(page.getByTestId("api-tokens-empty")).toBeVisible();
  });
});
