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
          capabilities: ["user:edit_own", "post:read"],
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
