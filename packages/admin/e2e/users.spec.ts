import { expect, test } from "@playwright/test";

import type { User } from "@plumix/core/schema";

import {
  AUTHED_ADMIN,
  mockRpc,
  mockRpcWithCapture,
  rpcConflictBody,
  rpcOkBody,
} from "./support/rpc-mock.js";

// All /users admin coverage lives here:
//   - /users list (role filter, search, access gates)
//   - /users/create invite form (happy path, email-taken, cap gate)
//   - /users/$id/edit edit (admin-editing-other, self-via-profile, last-admin
//     CONFLICT, delete-with-reassign)
//   - /users/$id/edit cards: email change (self + admin oversight) and
//     API tokens (self mint/revoke + admin oversight)
// Ordering follows the user journey: list → invite → edit → cards.

function user(overrides: Partial<User> & { id: number; email: string }): User {
  return {
    slug: `user-${String(overrides.id)}`,
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

// The self-edit page loads the passkeys, sessions, and API-tokens
// cards alongside the form — every self-profile test needs these.
const SELF_EDIT_LISTS = {
  "/auth/credentials/list": [],
  "/auth/sessions/list": [],
  "/auth/apiTokens/list": [],
} as const;

test.describe("/users", () => {
  test("renders the admin's own row + invited users, gated by user:list", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/list": [
        user({
          id: 1,
          email: "admin@example.test",
          name: "Admin",
          role: "admin",
        }),
        user({
          id: 2,
          email: "eddie@example.test",
          name: "Eddie Editor",
          role: "editor",
        }),
        user({
          id: 3,
          email: "sub@example.test",
          role: "subscriber",
          disabledAt: new Date("2026-04-20T00:00:00Z"),
        }),
      ],
    });

    await page.goto("users");
    await expect(page.getByTestId("users-list-heading")).toBeVisible();

    // Each user's name column is keyed by id so other columns (role,
    // status) can be asserted relative to the row without text coupling.
    await expect(page.getByTestId("users-list-row-1")).toBeVisible();
    await expect(page.getByTestId("users-list-row-2")).toBeVisible();
    await expect(page.getByTestId("users-list-row-3")).toBeVisible();

    // Admin is shown as "You" — matches WP's self-marker on the user list.
    await expect(
      page.getByTestId("users-list-row-1").getByTestId("users-list-row-you"),
    ).toBeVisible();

    // Invite button is visible for an admin (has `user:create`).
    await expect(page.getByTestId("users-list-invite-button")).toBeVisible();
  });

  test("empty-state card renders when no users match the filter", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/list": [],
    });
    await page.goto("users");
    await expect(page.getByTestId("users-list-empty-state")).toBeVisible();
  });

  test("role filter URL-syncs and triggers a refetch", async ({ page }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/list": [],
    });
    await page.goto("users");
    await page.getByTestId("users-role-filter").click();
    await page.getByTestId("users-role-filter-editor").click();
    await expect(page).toHaveURL(/role=editor/);
    await expect(page).toHaveURL(/page=1/);
  });

  test("search box URL-syncs ?q= after debounce", async ({ page }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/list": [],
    });
    await page.goto("users");
    await page.getByTestId("users-list-search-input").fill("eddie");
    await expect(page).toHaveURL(/q=eddie/, { timeout: 2000 });
  });

  test("non-admin session without user:list is redirected to the dashboard", async ({
    page,
  }) => {
    // Subscriber-shaped session — no `user:list` capability.
    await mockRpc(page, {
      "/auth/session": {
        user: {
          id: 5,
          email: "sub@example.test",
          name: "Sub",
          avatarUrl: null,
          role: "subscriber",
          capabilities: ["entry:post:read"],
        },
        needsBootstrap: false,
      },
    });
    await page.goto("users");
    // Router redirect lands on dashboard.
    await expect(page).toHaveURL(/_plumix\/admin\/?$/);
  });
});

test.describe("/users/create", () => {
  test("invite happy path: email + role → success screen with copy-able URL", async ({
    page,
  }) => {
    const inviteInputs = await mockRpcWithCapture(page, {
      captureSuffix: "/user/invite",
      captureResponse: {
        user: user({
          id: 42,
          email: "newbie@example.test",
          name: null,
          role: "editor",
        }),
        inviteToken: "opaque-invite-token-xyz",
      },
      handlers: { "/auth/session": AUTHED_ADMIN },
    });

    await page.goto("users/create");
    await expect(page.getByTestId("invite-heading")).toBeVisible();

    await page.getByTestId("invite-email-input").fill("newbie@example.test");
    await page.getByTestId("invite-role-select").click();
    await page.getByTestId("invite-role-select-editor").click();
    await page.getByTestId("invite-submit").click();

    // Submission forwards the expected shape to user.invite.
    await expect
      .poll(
        () => (inviteInputs.at(-1) as { email?: string } | undefined)?.email,
      )
      .toBe("newbie@example.test");
    expect((inviteInputs.at(-1) as { role?: string } | undefined)?.role).toBe(
      "editor",
    );

    // Success screen shows the copy-able URL with the token embedded.
    await expect(page.getByTestId("invite-success-heading")).toBeVisible();
    await expect(page.getByTestId("invite-url-input")).toHaveValue(
      /accept-invite\/opaque-invite-token-xyz$/,
    );
  });

  test("email-taken CONFLICT surfaces a friendly message from the server", async ({
    page,
  }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/user/invite", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: rpcConflictBody("email_taken"),
      }),
    );

    await page.goto("users/create");
    await page.getByTestId("invite-email-input").fill("taken@example.test");
    await page.getByTestId("invite-submit").click();

    await expect(page.getByTestId("invite-server-error")).toBeVisible();
    await expect(page.getByTestId("invite-server-error")).toContainText(
      "email already exists",
    );
  });

  test("non-admin without user:create is bounced to /users", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": {
        user: {
          id: 6,
          email: "ed@example.test",
          name: "Ed",
          avatarUrl: null,
          role: "editor",
          // Editor has user:list but NOT user:create.
          capabilities: ["user:list", "entry:post:read"],
        },
        needsBootstrap: false,
      },
      "/user/list": [],
    });
    await page.goto("users/create");
    // Route's beforeLoad redirects to /users.
    await expect(page).toHaveURL(/\/users/);
    await expect(page.getByTestId("users-list-heading")).toBeVisible();
  });
});

test.describe("/users/$id/edit", () => {
  test("admin editing another user: form prefilled, role dropdown visible, Disable + Delete cards present", async ({
    page,
  }) => {
    const target = user({
      id: 42,
      email: "eddie@example.test",
      name: "Eddie",
      role: "editor",
    });
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/get": target,
      "/user/list": [target, user({ id: 1, email: "admin@example.test" })],
    });
    await page.goto("users/42/edit");

    await expect(page.getByTestId("user-edit-heading")).toContainText(
      "Edit eddie@example.test",
    );
    await expect(page.getByTestId("user-edit-email")).toHaveText(
      "eddie@example.test",
    );
    await expect(page.getByTestId("user-edit-name-input")).toHaveValue("Eddie");
    // The Radix role trigger shows the long role label, not a native value.
    await expect(page.getByTestId("user-edit-role-select")).toContainText(
      "Editor",
    );
    // Disable + Delete surfaces are visible to admin-editing-other.
    await expect(page.getByTestId("user-edit-disable-button")).toBeVisible();
    await expect(page.getByTestId("user-edit-delete-button")).toBeVisible();
  });

  test("self-edit via /profile: redirects to /users/$id/edit, role dropdown hidden, no Disable/Delete", async ({
    page,
  }) => {
    // AUTHED_ADMIN.user.id === 1 — /profile redirects to /users/1.
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/get": user({
        id: 1,
        email: "admin@example.test",
        name: "Admin",
        role: "admin",
      }),
    });
    await page.goto("profile");
    await expect(page).toHaveURL(/\/users\/1/);
    await expect(page.getByTestId("user-edit-heading")).toContainText(
      "Your profile",
    );
    // Role is shown as a read-only badge; dropdown is hidden.
    await expect(page.getByTestId("user-edit-role-select")).toHaveCount(0);
    // You can't disable or delete yourself.
    await expect(page.getByTestId("user-edit-disable-button")).toHaveCount(0);
    await expect(page.getByTestId("user-edit-delete-button")).toHaveCount(0);
  });

  test("name update: PATCHes user.update and shows no errors", async ({
    page,
  }) => {
    const target = user({ id: 42, email: "a@example.test", name: "Before" });
    const updateInputs = await mockRpcWithCapture(page, {
      captureSuffix: "/user/update",
      captureResponse: { ...target, name: "After" },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/user/get": target,
      },
    });

    await page.goto("users/42/edit");
    await page.getByTestId("user-edit-name-input").fill("After");
    await page.getByTestId("user-edit-submit").click();

    await expect
      .poll(() => (updateInputs.at(-1) as { name?: string } | undefined)?.name)
      .toBe("After");
  });

  test("last-admin CONFLICT surfaces a friendly form error on disable", async ({
    page,
  }) => {
    const target = user({ id: 1, email: "admin@example.test", role: "admin" });
    // Simulate a secondary admin viewing the primary admin's edit page
    // so Disable is visible but the server knows it's the last admin.
    await mockRpc(page, {
      "/auth/session": {
        user: {
          id: 9,
          email: "admin2@example.test",
          name: "Admin 2",
          avatarUrl: null,
          role: "admin",
          capabilities: AUTHED_ADMIN.user?.capabilities ?? [],
        },
        needsBootstrap: false,
      },
      "/user/get": target,
    });
    await page.route("**/_plumix/rpc/user/disable", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: rpcConflictBody("last_admin"),
      }),
    );

    await page.goto("users/1/edit");
    await page.getByTestId("user-edit-disable-button").click();
    await expect(page.getByTestId("user-status-error")).toBeVisible();
    await expect(page.getByTestId("user-status-error")).toContainText(
      "last administrator",
    );
  });

  test("delete flow: reveal reassign picker → confirm → redirect to /users", async ({
    page,
  }) => {
    const target = user({
      id: 42,
      email: "eddie@example.test",
      name: "Eddie",
      role: "editor",
    });
    const inheritor = user({
      id: 7,
      email: "inheritor@example.test",
      name: "Inheritor",
    });
    const deleteInputs = await mockRpcWithCapture(page, {
      captureSuffix: "/user/delete",
      captureResponse: target,
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/user/get": target,
        "/user/list": [target, inheritor],
      },
    });

    await page.goto("users/42/edit");
    await page.getByTestId("user-edit-delete-button").click();
    await page.getByTestId("user-delete-reassign-select").click();
    await page
      .getByTestId(`user-delete-reassign-select-${inheritor.id}`)
      .click();
    await page.getByTestId("user-delete-confirm-button").click();

    await expect
      .poll(
        () =>
          (
            deleteInputs.at(-1) as
              { id?: number; reassignTo?: number } | undefined
          )?.reassignTo,
      )
      .toBe(inheritor.id);
    await expect(page).toHaveURL(/\/users/);
    await expect(page).not.toHaveURL(/\/users\/42/);
  });

  test("self-save never includes `role` in the payload (guards against self-promotion)", async ({
    page,
  }) => {
    const adminSelf = user({
      id: 1,
      email: "admin@example.test",
      name: "Admin",
      role: "admin",
    });
    const updateInputs = await mockRpcWithCapture(page, {
      captureSuffix: "/user/update",
      captureResponse: { ...adminSelf, name: "Admin 2" },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/user/get": adminSelf,
      },
    });

    await page.goto("profile");
    await expect(page.getByTestId("user-edit-heading")).toContainText(
      "Your profile",
    );
    await page.getByTestId("user-edit-name-input").fill("Admin 2");
    await page.getByTestId("user-edit-submit").click();

    // Submit fires — assert the role field is absent so a future refactor
    // can't re-introduce a self-promotion hole via the form.
    await expect
      .poll(() => (updateInputs.at(-1) as { name?: string } | undefined)?.name)
      .toBe("Admin 2");
    const lastCall = updateInputs.at(-1) as Record<string, unknown> | undefined;
    expect(lastCall).toBeDefined();
    expect(lastCall).not.toHaveProperty("role");
  });

  test("subscriber can edit own row via /profile but not access /users/99", async ({
    page,
  }) => {
    const subscriber: User = user({
      id: 5,
      email: "sub@example.test",
      name: "Sub",
    });
    await mockRpc(page, {
      "/auth/session": {
        user: {
          id: 5,
          email: "sub@example.test",
          name: "Sub",
          avatarUrl: null,
          role: "subscriber",
          // Subscribers have `user:edit_own` by default but NOT `user:list`.
          capabilities: ["user:edit_own", "entry:post:read"],
        },
        needsBootstrap: false,
      },
      "/user/get": subscriber,
    });

    // Own row: works.
    await page.goto("users/5/edit");
    await expect(page.getByTestId("user-edit-heading")).toContainText(
      "Your profile",
    );

    // Someone else's row: redirected to dashboard.
    await page.goto("users/99/edit");
    await expect(page).toHaveURL(/_plumix\/admin\/?$/);
  });
});

test.describe("/users/$id/edit — email change (self)", () => {
  const self = user({ id: 1, email: "admin@example.test", role: "admin" });

  test("requesting a change shows the success copy + posts to requestEmailChange", async ({
    page,
  }) => {
    const inputs = await mockRpcWithCapture(page, {
      captureSuffix: "/user/requestEmailChange",
      captureResponse: {
        ok: true,
        expiresAt: new Date("2026-05-04T00:00:00Z"),
      },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/user/get": self,
        "/user/pendingEmailChange": { pending: null },
        ...SELF_EDIT_LISTS,
      },
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
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/get": self,
      "/user/pendingEmailChange": { pending: null },
      ...SELF_EDIT_LISTS,
    });
    await page.route("**/_plumix/rpc/user/requestEmailChange", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: rpcConflictBody("email_taken"),
      }),
    );

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
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/get": self,
      ...SELF_EDIT_LISTS,
    });
    await page.route("**/_plumix/rpc/user/pendingEmailChange", (route) =>
      route.fulfill({
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
      }),
    );
    await page.route("**/_plumix/rpc/user/cancelEmailChange", (route) => {
      cancelled = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ cancelled: 1 }),
      });
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
    const inputs = await mockRpcWithCapture(page, {
      captureSuffix: "/user/requestEmailChange",
      captureResponse: {
        ok: true,
        expiresAt: new Date("2026-05-04T00:00:00Z"),
      },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/user/get": user({
          id: 42,
          email: "victim@example.test",
          name: "Victim",
          role: "editor",
        }),
        "/user/pendingEmailChange": { pending: null },
        "/auth/apiTokens/adminList": {
          items: [],
          total: 0,
          limit: 50,
          offset: 0,
        },
      },
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

test.describe("/users/$id/edit — API tokens (self)", () => {
  const self = user({
    id: 1,
    email: "admin@example.test",
    name: "Admin",
    role: "admin",
  });

  test("renders the self mint form + lists own tokens", async ({ page }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/get": self,
      ...SELF_EDIT_LISTS,
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
    const inputs = await mockRpcWithCapture(page, {
      captureSuffix: "/auth/apiTokens/create",
      captureResponse: {
        secret: "pl_pat_abcdEFGHsecretxyz",
        token: token({ id: "tok-new", name: "ci" }),
      },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/user/get": self,
        ...SELF_EDIT_LISTS,
      },
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
        "/user/get": self,
        ...SELF_EDIT_LISTS,
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
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/get": self,
      "/auth/credentials/list": [],
      "/auth/sessions/list": [],
    });
    // Pre-revoke: one token. Post-revoke: empty list (refetch returns []).
    await page.route("**/_plumix/rpc/auth/apiTokens/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(
          revokes.length === 0
            ? [token({ id: "tok-z", name: "to-be-revoked" })]
            : [],
        ),
      }),
    );
    await page.route("**/_plumix/rpc/auth/apiTokens/revoke", (route) => {
      const body = route.request().postDataJSON() as { json?: unknown };
      revokes.push(body.json);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ id: "tok-z" }),
      });
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
  const target = user({ id: 42, email: "victim@example.test", role: "editor" });

  test("admin editing another user sees their tokens but no mint form", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/get": target,
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
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/user/get": target,
    });
    await page.route("**/_plumix/rpc/auth/apiTokens/adminList", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(
          revokes.length === 0
            ? {
                items: [token({ id: "tok-v", name: "leaked" })],
                total: 1,
                limit: 50,
                offset: 0,
              }
            : { items: [], total: 0, limit: 50, offset: 0 },
        ),
      }),
    );
    await page.route("**/_plumix/rpc/auth/apiTokens/adminRevoke", (route) => {
      const body = route.request().postDataJSON() as { json?: unknown };
      revokes.push(body.json);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ id: "tok-v" }),
      });
    });

    await page.goto("users/42/edit");
    await page.getByTestId("api-tokens-revoke-tok-v").click();
    await page.getByTestId("api-tokens-revoke-confirm-button").click();

    expect(revokes[0]).toMatchObject({ id: "tok-v" });
    await expect(page.getByTestId("api-tokens-empty")).toBeVisible();
  });
});
