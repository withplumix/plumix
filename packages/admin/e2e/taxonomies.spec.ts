import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Term } from "@plumix/core/schema";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_TAXONOMIES,
  mockManifest,
  mockRpc,
  rpcErrorBody,
  rpcEtagConflictBody,
  rpcLeaseBody,
  rpcLockedBody,
  rpcOkBody,
} from "./support/rpc-mock.js";

/** A term as the RPC sends it: its `version` travels as the `etag`. */
type TermWire = Omit<Term, "version"> & { readonly etag: string };

function term(
  overrides: Partial<TermWire> & { id: number; name: string },
): TermWire {
  return {
    taxonomy: "category",
    slug: overrides.name.toLowerCase().replaceAll(" ", "-"),
    description: null,
    parentId: null,
    meta: {},
    etag: "0",
    ...overrides,
  };
}

test.describe("/terms/$name (hierarchical)", () => {
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

    await page.goto("terms/category");
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
    await page.goto("terms/category");
    await expect(page.getByTestId("taxonomy-list-empty-state")).toBeVisible();
  });

  test("unregistered taxonomy name → not-found page", async ({ page }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.goto("terms/unregistered");
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
          capabilities: ["entry:post:read"],
        },
        needsBootstrap: false,
      },
    });
    await page.goto("terms/category");
    // beforeLoad throws notFound() since the user can't read this
    // taxonomy — the generic 404 surface handles it.
    await expect(page.getByTestId("not-found-page")).toBeVisible();
  });
});

test.describe("/terms/$name/create", () => {
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
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/term/list")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody([fruit]),
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

    await page.goto("terms/category/create");
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
    await expect(page).toHaveURL(/\/terms\/category\?/);
  });

  test("flat taxonomy (tag): parent picker is hidden", async ({ page }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/term/list": [],
    });
    await page.goto("terms/tag/create");
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
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/term/list")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody([]),
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

    await page.goto("terms/category/create");
    await page.getByTestId("term-form-name-input").fill("Dup");
    await page.getByTestId("term-form-submit").click();
    await expect(page.getByTestId("term-form-server-error")).toBeVisible();
    await expect(page.getByTestId("term-form-server-error")).toContainText(
      "slug already exists",
    );
  });
});

test.describe("/terms/$name/$id/edit", () => {
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
    await page.goto("terms/category/2/edit");
    await expect(page.getByTestId("term-edit-heading")).toContainText(
      "Edit category",
    );

    // Root + Fruit (id 1) only; Apple (self, id 2) + Granny (descendant,
    // id 3) excluded. Open the Radix picker and assert by option testid.
    await page.getByTestId("term-form-parent-select").click();
    await expect(
      page.getByTestId("term-form-parent-select-option-1"),
    ).toBeVisible();
    await expect(
      page.getByTestId("term-form-parent-select-option-2"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("term-form-parent-select-option-3"),
    ).toHaveCount(0);
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
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/term/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(target),
        });
      }
      if (url.endsWith("/term/list")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody([target]),
        });
      }
      if (url.endsWith("/term/delete")) {
        deleteInputs.push(
          (route.request().postDataJSON() as { json?: unknown }).json,
        );
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(target),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("terms/category/42/edit");
    await page.getByTestId("term-edit-delete-button").click();
    await page.getByTestId("term-delete-confirm-button").click();

    await expect
      .poll(() => (deleteInputs.at(-1) as { id?: number } | undefined)?.id)
      .toBe(42);
    await expect(page).toHaveURL(/\/terms\/category\?/);
  });
});

test.describe("/terms/$name/$id/edit concurrency", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_TAXONOMIES);
  });

  // A server holding one term whose token moves on every save.
  async function mockSavedTerm(page: Page): Promise<{
    readonly updates: Record<string, unknown>[];
    readonly saveElsewhere: (changes: Partial<TermWire>) => void;
  }> {
    let saved = term({ id: 7, name: "Fruit" });
    let version = 0;
    const updates: Record<string, unknown>[] = [];
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN, "/term/list": [] });
    await page.route("**/_plumix/rpc/term/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(saved),
      }),
    );
    const save = (changes: Partial<TermWire>): void => {
      version += 1;
      saved = { ...saved, ...changes, etag: String(version) };
    };
    await page.route("**/_plumix/rpc/term/update", (route) => {
      const {
        ifMatch,
        id: _id,
        ...changes
      } = (route.request().postDataJSON() as { json: Record<string, unknown> })
        .json;
      updates.push({ ifMatch, ...changes });
      if (ifMatch !== saved.etag) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: rpcEtagConflictBody(saved.etag),
        });
      }
      save({ name: String(changes.name) });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(saved),
      });
    });
    return { updates, saveElsewhere: save };
  }

  async function openConflictDialog(page: Page): Promise<{
    readonly updates: Record<string, unknown>[];
  }> {
    const { updates, saveElsewhere } = await mockSavedTerm(page);
    await page.goto("terms/category/7/edit");
    await expect(page.getByTestId("term-form-name-input")).toHaveValue("Fruit");
    saveElsewhere({ name: "Saved elsewhere" });
    await page.getByTestId("term-form-name-input").fill("Mine");
    await page.getByTestId("term-form-submit").click();
    await expect(page.getByTestId("entry-conflict-dialog")).toBeVisible();
    await expect(page.getByTestId("entry-conflict-dialog")).toContainText(
      "This term changed since you opened it",
    );
    return { updates };
  }

  test("a save after another session saved opens the conflict dialog, and Keep mine saves over it", async ({
    page,
  }) => {
    const { updates } = await openConflictDialog(page);

    await page.getByTestId("entry-conflict-keep-mine").click();

    await expect(page.getByTestId("entry-conflict-dialog")).toBeHidden();
    await expect
      .poll(() => updates.at(-1))
      .toMatchObject({ ifMatch: "1", name: "Mine" });
    expect(updates).toHaveLength(2);
  });

  test("Load theirs in the conflict dialog shows the other session's save", async ({
    page,
  }) => {
    await openConflictDialog(page);

    await page.getByTestId("entry-conflict-load-theirs").click();

    await expect(page.getByTestId("entry-conflict-dialog")).toBeHidden();
    await expect(page.getByTestId("term-form-name-input")).toHaveValue(
      "Saved elsewhere",
    );
  });

  test("a term another editor holds opens read-only, and Take over makes it editable", async ({
    page,
  }) => {
    const ada = { id: 2, name: "Ada" };
    const since = new Date("2026-05-20T09:05:00Z");
    const takeOvers: unknown[] = [];
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/term/get": term({ id: 7, name: "Fruit" }),
      "/term/list": [],
    });
    await page.route("**/_plumix/rpc/term/lease/acquire", (route) => {
      const { takeOver } = (
        route.request().postDataJSON() as { json: { takeOver?: boolean } }
      ).json;
      if (takeOver !== true) {
        return route.fulfill({
          status: 423,
          contentType: "application/json",
          body: rpcLockedBody(ada, since),
        });
      }
      takeOvers.push(takeOver);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcLeaseBody({ id: 1, name: "Admin" }, since),
      });
    });

    await page.goto("terms/category/7/edit");

    await expect(page.getByTestId("edit-lease-held-by")).toHaveText(
      "Ada is editing this term (since May 20, 2026, 9:05 AM)",
    );
    await expect(page.getByTestId("term-form-name-input")).toBeDisabled();
    await page.getByTestId("edit-lease-take-over").click();
    await expect(page.getByTestId("edit-lease-banner")).toBeHidden();
    await expect(page.getByTestId("term-form-name-input")).toBeEnabled();
    expect(takeOvers).toEqual([true]);
  });
});

test.describe("/terms/$name (list states)", () => {
  test("surfaces the load-error alert when term.list rejects", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_TAXONOMIES);
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/term/list", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: rpcErrorBody({ code: "INTERNAL_SERVER_ERROR", message: "boom" }),
      }),
    );
    await page.goto("terms/category");

    await expect(page.getByTestId("taxonomy-list-load-error")).toBeVisible();
  });

  test("a taxonomy's description renders under the list heading", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_TAXONOMIES,
      termTaxonomies: [
        {
          name: "category",
          label: "Categories",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          description: {
            id: "e2e.category.description",
            message: "Group posts by subject",
          },
        },
      ],
    });
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN, "/term/list": [] });
    await page.goto("terms/category");

    await expect(page.getByTestId("taxonomy-list-description")).toHaveText(
      "Group posts by subject",
    );
  });
});
