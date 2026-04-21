import { expect, test } from "@playwright/test";

import type { Term } from "@plumix/core/schema";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_TAXONOMIES,
  mockManifest,
  mockRpc,
} from "./support/rpc-mock.js";

function term(overrides: Partial<Term> & { id: number; name: string }): Term {
  return {
    taxonomy: "category",
    slug: overrides.name.toLowerCase().replaceAll(" ", "-"),
    description: null,
    parentId: null,
    meta: {},
    ...overrides,
  };
}

test.describe("/taxonomies/$name (hierarchical)", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_TAXONOMIES);
  });

  test("renders a tree-indented list and shows the New button for caps holders", async ({
    page,
  }) => {
    const fruit = term({ id: 1, name: "Fruit", taxonomy: "category" });
    const apple = term({
      id: 2,
      name: "Apple",
      taxonomy: "category",
      parentId: 1,
    });
    const granny = term({
      id: 3,
      name: "Granny Smith",
      taxonomy: "category",
      parentId: 2,
    });
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/term/list": [fruit, apple, granny],
    });

    await page.goto("taxonomies/category");
    await expect(page.getByTestId("taxonomy-list-heading")).toHaveText(
      "Categories",
    );

    // Tree ordering: root (Fruit) → child (Apple) → grandchild (Granny).
    const row1 = page.getByTestId("taxonomy-list-row-1");
    const row2 = page.getByTestId("taxonomy-list-row-2");
    const row3 = page.getByTestId("taxonomy-list-row-3");
    await expect(row1).toHaveAttribute("aria-level", "1");
    await expect(row2).toHaveAttribute("aria-level", "2");
    await expect(row3).toHaveAttribute("aria-level", "3");

    // Admin has `category:edit` cap — New button is visible.
    await expect(page.getByTestId("taxonomy-list-new-button")).toBeVisible();
  });

  test("empty state renders when the taxonomy has no terms", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/term/list": [],
    });
    await page.goto("taxonomies/category");
    await expect(page.getByTestId("taxonomy-list-empty-state")).toBeVisible();
  });

  test("unregistered taxonomy name → not-found page", async ({ page }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.goto("taxonomies/unregistered");
    // TanStack Router renders the admin's generic not-found state.
    await expect(page.getByTestId("not-found-page")).toBeVisible();
  });

  test("subscriber without `category:read` is redirected away from the list", async ({
    page,
  }) => {
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
    await page.goto("taxonomies/category");
    // beforeLoad throws notFound() since the user can't read this
    // taxonomy — the generic 404 surface handles it.
    await expect(page.getByTestId("not-found-page")).toBeVisible();
  });
});

test.describe("/taxonomies/$name/new", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_TAXONOMIES);
  });

  test("hierarchical: parent picker shows existing terms, derives slug from name on submit", async ({
    page,
  }) => {
    const createInputs: unknown[] = [];
    const fruit = term({ id: 1, name: "Fruit", taxonomy: "category" });
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/term/list")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: [fruit], meta: [] }),
        });
      }
      if (url.endsWith("/term/create")) {
        createInputs.push(
          (route.request().postDataJSON() as { json?: unknown }).json,
        );
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: term({
              id: 42,
              name: "Vegetables",
              taxonomy: "category",
              slug: "vegetables",
            }),
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("taxonomies/category/new");
    await expect(page.getByTestId("term-new-heading")).toContainText(
      "New category",
    );
    await page.getByTestId("term-form-name-input").fill("Vegetables");
    // Leave slug blank — should be derived from name on submit.
    await page.getByTestId("term-form-submit").click();

    await expect
      .poll(() => (createInputs.at(-1) as { slug?: string } | undefined)?.slug)
      .toBe("vegetables");
    expect((createInputs.at(-1) as { name?: string } | undefined)?.name).toBe(
      "Vegetables",
    );
    // Redirected back to list on success.
    await expect(page).toHaveURL(/\/taxonomies\/category\?/);
  });

  test("flat taxonomy (tag): parent picker is hidden", async ({ page }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/term/list": [],
    });
    await page.goto("taxonomies/tag/new");
    await expect(page.getByTestId("term-new-heading")).toContainText("New tag");
    // Parent picker is hidden for flat taxonomies.
    await expect(page.getByTestId("term-form-parent-select")).toHaveCount(0);
  });

  test("slug_taken CONFLICT surfaces a friendly message", async ({ page }) => {
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/term/list")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: [], meta: [] }),
        });
      }
      if (url.endsWith("/term/create")) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              defined: true,
              code: "CONFLICT",
              status: 409,
              message: "Resource conflict",
              data: { reason: "slug_taken" },
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("taxonomies/category/new");
    await page.getByTestId("term-form-name-input").fill("Dup");
    await page.getByTestId("term-form-submit").click();
    await expect(page.getByTestId("term-form-server-error")).toBeVisible();
    await expect(page.getByTestId("term-form-server-error")).toContainText(
      "slug already exists",
    );
  });
});

test.describe("/taxonomies/$name/$id", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_TAXONOMIES);
  });

  test("edit: parent picker excludes self and descendants (cycle prevention)", async ({
    page,
  }) => {
    // Tree: Fruit (1) → Apple (2) → Granny (3). Editing Apple's parent
    // must exclude Apple (self) and Granny (descendant) so the user
    // can't pick a cycle the server would reject.
    const fruit = term({ id: 1, name: "Fruit", taxonomy: "category" });
    const apple = term({
      id: 2,
      name: "Apple",
      taxonomy: "category",
      parentId: 1,
    });
    const granny = term({
      id: 3,
      name: "Granny Smith",
      taxonomy: "category",
      parentId: 2,
    });
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/term/get": apple,
      "/term/list": [fruit, apple, granny],
    });
    await page.goto("taxonomies/category/2");
    await expect(page.getByTestId("term-edit-heading")).toContainText(
      "Edit category",
    );

    const selectOptions = await page
      .getByTestId("term-form-parent-select")
      .locator("option")
      .allTextContents();
    // Root + Fruit only; Apple (self) + Granny (descendant) excluded.
    expect(selectOptions.some((o) => o.includes("Fruit"))).toBe(true);
    expect(selectOptions.some((o) => o.includes("Apple"))).toBe(false);
    expect(selectOptions.some((o) => o.includes("Granny"))).toBe(false);
  });

  test("delete flow: confirm → redirect to list", async ({ page }) => {
    const target = term({ id: 42, name: "Stale", taxonomy: "category" });
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
      if (url.endsWith("/term/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: target, meta: [] }),
        });
      }
      if (url.endsWith("/term/list")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: [target], meta: [] }),
        });
      }
      if (url.endsWith("/term/delete")) {
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

    await page.goto("taxonomies/category/42");
    await page.getByTestId("term-edit-delete-button").click();
    await page.getByTestId("term-delete-confirm-button").click();

    await expect
      .poll(() => (deleteInputs.at(-1) as { id?: number } | undefined)?.id)
      .toBe(42);
    await expect(page).toHaveURL(/\/taxonomies\/category\?/);
  });
});
