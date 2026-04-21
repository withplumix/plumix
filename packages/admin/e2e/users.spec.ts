import { expect, test } from "@playwright/test";

import type { User } from "@plumix/core/schema";

import { AUTHED_ADMIN, mockRpc } from "./support/rpc-mock.js";

function user(overrides: Partial<User> & { id: number; email: string }): User {
  return {
    name: null,
    avatarUrl: null,
    role: "subscriber",
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
          capabilities: ["post:read"],
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
          capabilities: ["user:list", "post:read"],
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
