import { expect, test } from "@playwright/test";

import type { User } from "@plumix/core/schema";

import { AUTHED_ADMIN, mockRpc } from "./support/rpc-mock.js";

// All /users admin coverage lives here:
//   - /users list (role filter, search, access gates)
//   - /users/new invite form (happy path, email-taken, cap gate)
//   - /users/$id edit (admin-editing-other, self-via-profile, last-admin
//     CONFLICT, delete-with-reassign)
// Ordering follows the user journey: list → invite → edit.

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
      page.getByTestId("users-list-row-1").locator("text=You"),
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

test.describe("/users/new", () => {
  test("invite happy path: email + role → success screen with copy-able URL", async ({
    page,
  }) => {
    const inviteInputs: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/user/invite")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        inviteInputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              user: user({
                id: 42,
                email: "newbie@example.test",
                name: null,
                role: "editor",
              }),
              inviteToken: "opaque-invite-token-xyz",
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("users/new");
    await expect(page.getByTestId("invite-heading")).toBeVisible();

    await page.getByTestId("invite-email-input").fill("newbie@example.test");
    await page.getByTestId("invite-role-select").selectOption("editor");
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
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/user/invite")) {
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

    await page.goto("users/new");
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
    await page.goto("users/new");
    // Route's beforeLoad redirects to /users.
    await expect(page).toHaveURL(/\/users/);
    await expect(page.getByTestId("users-list-heading")).toBeVisible();
  });
});
test.describe("/users/$id", () => {
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
    await page.goto("users/42");

    await expect(page.getByTestId("user-edit-heading")).toContainText(
      "Edit eddie@example.test",
    );
    await expect(page.getByTestId("user-edit-email")).toHaveText(
      "eddie@example.test",
    );
    await expect(page.getByTestId("user-edit-name-input")).toHaveValue("Eddie");
    await expect(page.getByTestId("user-edit-role-select")).toHaveValue(
      "editor",
    );
    // Disable + Delete surfaces are visible to admin-editing-other.
    await expect(page.getByTestId("user-edit-disable-button")).toBeVisible();
    await expect(page.getByTestId("user-edit-delete-button")).toBeVisible();
  });

  test("self-edit via /profile: redirects to /users/$id, role dropdown hidden, no Disable/Delete", async ({
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
    const updateInputs: unknown[] = [];
    const target = user({ id: 42, email: "a@example.test", name: "Before" });
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/user/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: target, meta: [] }),
        });
      }
      if (url.endsWith("/user/update")) {
        updateInputs.push(
          (route.request().postDataJSON() as { json?: unknown }).json,
        );
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: { ...target, name: "After" },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("users/42");
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
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        // Simulate a secondary admin viewing the primary admin's edit page
        // so Disable is visible but the server knows it's the last admin.
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
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
            meta: [],
          }),
        });
      }
      if (url.endsWith("/user/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: target, meta: [] }),
        });
      }
      if (url.endsWith("/user/disable")) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              defined: true,
              code: "CONFLICT",
              status: 409,
              message: "Resource conflict",
              data: { reason: "last_admin" },
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("users/1");
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
    const deleteInputs: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/user/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: target, meta: [] }),
        });
      }
      if (url.endsWith("/user/list")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: [target, inheritor], meta: [] }),
        });
      }
      if (url.endsWith("/user/delete")) {
        deleteInputs.push(
          (route.request().postDataJSON() as { json?: unknown }).json,
        );
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: target, meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("users/42");
    // Reveal confirmation → pick reassignee → confirm.
    await page.getByTestId("user-edit-delete-button").click();
    await page
      .getByTestId("user-delete-reassign-select")
      .selectOption(String(inheritor.id));
    await page.getByTestId("user-delete-confirm-button").click();

    await expect
      .poll(
        () =>
          (
            deleteInputs.at(-1) as
              | { id?: number; reassignPostsTo?: number }
              | undefined
          )?.reassignPostsTo,
      )
      .toBe(inheritor.id);
    await expect(page).toHaveURL(/\/users/);
    await expect(page).not.toHaveURL(/\/users\/42/);
  });

  test("self-save never includes `role` in the payload (guards against self-promotion)", async ({
    page,
  }) => {
    const updateInputs: unknown[] = [];
    const adminSelf = user({
      id: 1,
      email: "admin@example.test",
      name: "Admin",
      role: "admin",
    });
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/user/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: adminSelf, meta: [] }),
        });
      }
      if (url.endsWith("/user/update")) {
        updateInputs.push(
          (route.request().postDataJSON() as { json?: unknown }).json,
        );
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: { ...adminSelf, name: "Admin 2" },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
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
    await page.goto("users/5");
    await expect(page.getByTestId("user-edit-heading")).toContainText(
      "Your profile",
    );

    // Someone else's row: redirected to dashboard.
    await page.goto("users/99");
    await expect(page).toHaveURL(/_plumix\/admin\/?$/);
  });
});
