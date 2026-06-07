// /entries/$slug list coverage: filters, search, sort, pagination,
// trash, capability gates, and the loading/empty/error/not-found
// states. The list mock always returns fixtures — tests assert the
// captured `entry.list` input (the server contract) plus the rendered
// rows, never persistence.

import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import type { Entry, Term } from "@plumix/core/schema";
import { emptyManifest } from "@plumix/core/manifest";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
  mockRpcWithCapture,
  rpcErrorBody,
  rpcOkBody,
} from "./support/rpc-mock.js";

const T0 = new Date("2026-04-19T12:00:00Z");

function entry(
  overrides: Partial<Entry> & { id: number; title: string },
): Entry {
  return {
    type: "post",
    parentId: null,
    slug: overrides.title.toLowerCase().replaceAll(" ", "-"),
    content: null,
    excerpt: null,
    status: "published",
    authorId: 1,
    sortOrder: 0,
    publishedAt: T0,
    createdAt: T0,
    updatedAt: T0,
    meta: {},
    ...overrides,
  };
}

const TWO_ROWS = [
  entry({ id: 1, title: "Hello world" }),
  entry({ id: 2, title: "Draft in progress", status: "draft" }),
];

test.describe("/entries/$slug (list)", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("renders skeleton rows while loading, with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    // Deferred promise: we control when /entry/list resolves, letting the
    // page sit in its loading state while axe runs, then releasing it so
    // Playwright's teardown isn't waiting on a pending request.
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });

    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/list", async (route) => {
      await pending;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody([]),
      });
    });

    await page.goto("entries/posts");
    await expect(page.getByTestId("content-list-heading")).toBeVisible();
    await expect(page.getByTestId("data-table-loading")).toBeVisible();
    await expectNoAxeViolations(page);

    release?.();
  });

  test("renders rows with zero WCAG 2.1 AA violations", async ({ page }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/list": TWO_ROWS,
    });
    await page.goto("entries/posts");

    const helloRow = page.getByTestId("content-list-row-1");
    await expect(helloRow).toBeVisible();
    await expect(helloRow).toContainText("Hello world");
    await expect(page.getByTestId("content-list-row-2")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("renders empty state with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/list": [],
    });
    await page.goto("entries/posts");
    await expect(page.getByTestId("content-list-empty-state")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("renders the router's not-found state when the slug isn't registered", async ({
    page,
  }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.goto("entries/unknown-type");
    await expect(page.getByTestId("not-found-page")).toBeVisible();
  });

  test("surfaces the load-error alert when entry.list rejects", async ({
    page,
  }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/list", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: rpcErrorBody({ code: "INTERNAL_SERVER_ERROR", message: "boom" }),
      }),
    );
    await page.goto("entries/posts");
    await expect(page.getByTestId("content-list-load-error")).toBeVisible();
  });

  test("search box URL-syncs ?q= and ships `search` in the refetch input", async ({
    page,
  }) => {
    const inputs = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/list",
      captureResponse: [],
      handlers: { "/auth/session": AUTHED_ADMIN },
    });

    await page.goto("entries/posts");
    await page.getByTestId("content-list-search-input").fill("quantum");
    await expect(page).toHaveURL(/q=quantum/);
    await expect
      .poll(
        () =>
          (inputs.at(-1) as { search?: string } | undefined)?.search ?? null,
      )
      .toBe("quantum");
  });

  test("status pill URL-syncs and ships `status` in the refetch input", async ({
    page,
  }) => {
    const inputs = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/list",
      captureResponse: [],
      handlers: { "/auth/session": AUTHED_ADMIN },
    });

    await page.goto("entries/posts?page=3");
    await expect.poll(() => inputs.length).toBeGreaterThan(0);
    // First call is deterministic — `at(-1)` could race a refetch.
    expect(inputs[0]).not.toHaveProperty("status");

    await page.getByTestId("status-view-published").click();
    await expect(page).toHaveURL(/status=published/);
    // Filter changes reset pagination.
    await expect(page).toHaveURL(/page=1/);
    await expect
      .poll(
        () =>
          (inputs.at(-1) as { status?: string } | undefined)?.status ?? null,
      )
      .toBe("published");
  });

  test("Mine filter URL-syncs author=mine and sends session.user.id as authorId", async ({
    page,
  }) => {
    const inputs = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/list",
      captureResponse: [],
      handlers: { "/auth/session": AUTHED_ADMIN },
    });

    await page.goto("entries/posts");
    await page.getByTestId("author-filter").click();
    await page.getByTestId("author-filter-mine").click();
    await expect(page).toHaveURL(/author=mine/);
    await expect
      .poll(
        () =>
          (inputs.at(-1) as { authorId?: number } | undefined)?.authorId ??
          null,
      )
      .toBe(AUTHED_ADMIN.user?.id);
  });

  test("column sort: Title defaults to asc, second click flips to desc", async ({
    page,
  }) => {
    const inputs = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/list",
      captureResponse: [],
      handlers: { "/auth/session": AUTHED_ADMIN },
    });

    const lastSort = (): string | null => {
      const last = inputs.at(-1) as
        | { orderBy?: string; order?: string }
        | undefined;
      return last ? `${last.orderBy ?? ""}:${last.order ?? ""}` : null;
    };

    await page.goto("entries/posts");
    await page.getByTestId("content-list-sort-title").click();
    await expect(page).toHaveURL(/orderBy=title/);
    await expect(page).toHaveURL(/order=asc/);
    await expect.poll(lastSort).toBe("title:asc");

    await page.getByTestId("content-list-sort-title").click();
    await expect(page).toHaveURL(/order=desc/);
    await expect.poll(lastSort).toBe("title:desc");
  });

  test("pagination: a full page enables Next; clicking it ships the next offset", async ({
    page,
  }) => {
    const fullPage = Array.from({ length: 20 }, (_, i) =>
      entry({ id: i + 1, title: `Post ${String(i + 1)}` }),
    );
    const inputs = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/list",
      captureResponse: fullPage,
      handlers: { "/auth/session": AUTHED_ADMIN },
    });

    await page.goto("entries/posts");
    await expect(page.getByTestId("content-list-row-1")).toBeVisible();
    await expect(page.getByTestId("list-pagination-prev")).toBeDisabled();
    // Pin page 1's offset so the (page - 1) * PAGE_SIZE multiplier
    // itself is load-bearing, not just the page-2 delta.
    expect((inputs[0] as { offset?: number } | undefined)?.offset).toBe(0);

    await page.getByTestId("list-pagination-next").click();
    await expect(page).toHaveURL(/page=2/);
    await expect
      .poll(
        () => (inputs.at(-1) as { offset?: number } | undefined)?.offset ?? -1,
      )
      .toBe(20);
    await expect(page.getByTestId("list-pagination-prev")).toBeEnabled();
  });

  test("trash flow: row action → confirm dialog → entry.trash payload → refetched list drops the row", async ({
    page,
  }) => {
    const trashed: unknown[] = [];
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(trashed.length === 0 ? TWO_ROWS : [TWO_ROWS[1]]),
      }),
    );
    await page.route("**/_plumix/rpc/entry/trash", (route) => {
      const body = route.request().postDataJSON() as { json?: unknown };
      trashed.push(body.json);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ ...TWO_ROWS[0], status: "trash" }),
      });
    });

    await page.goto("entries/posts");
    // Row actions are hover-revealed; hover the row to surface them.
    await page.getByTestId("content-list-row-1").hover();
    await page.getByTestId("content-list-row-trash-1").click();
    await page.getByTestId("content-list-trash-confirm").click();

    expect(trashed[0]).toMatchObject({ id: 1 });
    // Successful trash invalidates the list query — the row disappears.
    await expect(page.getByTestId("content-list-row-1")).toHaveCount(0);
    await expect(page.getByTestId("content-list-row-2")).toBeVisible();
    await expect(page.getByTestId("toast-success")).toBeVisible();
  });

  test("bulk trash: select all → bar → confirm → entry.trashMany payload → rows drop", async ({
    page,
  }) => {
    const trashed: unknown[] = [];
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(trashed.length === 0 ? TWO_ROWS : []),
      }),
    );
    await page.route("**/_plumix/rpc/entry/trashMany", (route) => {
      const body = route.request().postDataJSON() as {
        json?: { ids: number[] };
      };
      trashed.push(body.json);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ ids: body.json?.ids ?? [] }),
      });
    });

    await page.goto("entries/posts");
    // No bar until something is selected.
    await expect(page.getByTestId("content-list-bulk-bar")).toHaveCount(0);
    await page.getByTestId("content-list-select-all").check();
    await expect(page.getByTestId("content-list-bulk-bar")).toBeVisible();
    await expect(page.getByTestId("content-list-bulk-count")).toContainText(
      "2",
    );

    await page.getByTestId("content-list-bulk-trash").click();
    await page.getByTestId("content-list-bulk-confirm").click();

    expect(trashed[0]).toMatchObject({ ids: [1, 2] });
    await expect(page.getByTestId("content-list-row-1")).toHaveCount(0);
    await expect(page.getByTestId("toast-success")).toBeVisible();
  });

  test("bulk trash uses only the individually selected rows", async ({
    page,
  }) => {
    const trashed: unknown[] = [];
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(trashed.length === 0 ? TWO_ROWS : [TWO_ROWS[1]]),
      }),
    );
    await page.route("**/_plumix/rpc/entry/trashMany", (route) => {
      const body = route.request().postDataJSON() as {
        json?: { ids: number[] };
      };
      trashed.push(body.json);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ ids: body.json?.ids ?? [] }),
      });
    });

    await page.goto("entries/posts");
    await page.getByTestId("content-list-select-1").check();
    await page.getByTestId("content-list-bulk-trash").click();
    await page.getByTestId("content-list-bulk-confirm").click();

    expect(trashed[0]).toMatchObject({ ids: [1] });
  });

  test("trash view: bulk bar offers Restore + Delete permanently, not Trash", async ({
    page,
  }) => {
    const TRASHED = [
      entry({ id: 7, title: "Binned A", status: "trash" }),
      entry({ id: 8, title: "Binned B", status: "trash" }),
    ];
    const restored: unknown[] = [];
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(restored.length === 0 ? TRASHED : []),
      }),
    );
    await page.route("**/_plumix/rpc/entry/restoreMany", (route) => {
      const body = route.request().postDataJSON() as {
        json?: { ids: number[] };
      };
      restored.push(body.json);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ ids: body.json?.ids ?? [] }),
      });
    });

    await page.goto("entries/posts?status=trash");
    await page.getByTestId("content-list-select-all").check();
    await expect(page.getByTestId("content-list-bulk-restore")).toBeVisible();
    await expect(page.getByTestId("content-list-bulk-delete")).toBeVisible();
    await expect(page.getByTestId("content-list-bulk-trash")).toHaveCount(0);

    // Restore fires immediately (no confirm — it's recoverable).
    await page.getByTestId("content-list-bulk-restore").click();
    expect(restored[0]).toMatchObject({ ids: [7, 8] });
    await expect(page.getByTestId("toast-success")).toBeVisible();
  });

  test("without delete cap: the select column is absent", async ({ page }) => {
    await mockRpc(page, {
      "/auth/session": {
        user: {
          id: 5,
          email: "viewer@example.test",
          name: "Viewer",
          avatarUrl: null,
          role: "subscriber",
          capabilities: ["entry:post:read"],
        },
        needsBootstrap: false,
      },
      "/entry/list": TWO_ROWS,
    });
    await page.goto("entries/posts");
    await expect(page.getByTestId("content-list-row-1")).toBeVisible();
    await expect(page.getByTestId("content-list-select-all")).toHaveCount(0);
  });

  test("duplicate flow: row action → entry.duplicate payload → toast + refetched list", async ({
    page,
  }) => {
    const duplicated: unknown[] = [];
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(
          duplicated.length === 0
            ? TWO_ROWS
            : [
                ...TWO_ROWS,
                entry({ id: 3, title: "Hello world (copy)", status: "draft" }),
              ],
        ),
      }),
    );
    await page.route("**/_plumix/rpc/entry/duplicate", (route) => {
      const body = route.request().postDataJSON() as { json?: unknown };
      duplicated.push(body.json);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(
          entry({ id: 3, title: "Hello world (copy)", status: "draft" }),
        ),
      });
    });

    await page.goto("entries/posts");
    await page.getByTestId("content-list-row-1").hover();
    await page.getByTestId("content-list-row-duplicate-1").click();

    expect(duplicated[0]).toMatchObject({ id: 1 });
    await expect(page.getByTestId("toast-success")).toBeVisible();
    await expect(page.getByTestId("content-list-row-3")).toBeVisible();
  });

  test("without create cap: Duplicate row action is absent", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": {
        user: {
          id: 5,
          email: "viewer@example.test",
          name: "Viewer",
          avatarUrl: null,
          role: "subscriber",
          capabilities: ["entry:post:read"],
        },
        needsBootstrap: false,
      },
      "/entry/list": TWO_ROWS,
    });
    await page.goto("entries/posts");
    await page.getByTestId("content-list-row-1").hover();
    await expect(page.getByTestId("content-list-row-duplicate-1")).toHaveCount(
      0,
    );
  });

  test("trash view: Restore row action → entry.restore payload → refetched list drops the row", async ({
    page,
  }) => {
    const TRASHED_ROW = entry({ id: 3, title: "Binned", status: "trash" });
    const restored: unknown[] = [];
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(restored.length === 0 ? [TRASHED_ROW] : []),
      }),
    );
    await page.route("**/_plumix/rpc/entry/restore", (route) => {
      const body = route.request().postDataJSON() as { json?: unknown };
      restored.push(body.json);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ ...TRASHED_ROW, status: "draft" }),
      });
    });

    await page.goto("entries/posts?status=trash");
    await page.getByTestId("content-list-row-3").hover();
    await page.getByTestId("content-list-row-restore-3").click();

    expect(restored[0]).toMatchObject({ id: 3 });
    await expect(page.getByTestId("content-list-row-3")).toHaveCount(0);
    await expect(page.getByTestId("toast-success")).toBeVisible();
  });

  test("trash view: Delete permanently → confirm dialog → entry.deletePermanent payload → row gone", async ({
    page,
  }) => {
    const TRASHED_ROW = entry({ id: 3, title: "Binned", status: "trash" });
    const deleted: unknown[] = [];
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(deleted.length === 0 ? [TRASHED_ROW] : []),
      }),
    );
    await page.route("**/_plumix/rpc/entry/deletePermanent", (route) => {
      const body = route.request().postDataJSON() as { json?: unknown };
      deleted.push(body.json);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(TRASHED_ROW),
      });
    });

    await page.goto("entries/posts?status=trash");
    await page.getByTestId("content-list-row-3").hover();
    await page.getByTestId("content-list-row-delete-3").click();
    // Permanent delete is unrecoverable — it must go through a confirm
    // dialog, unlike Restore which fires immediately.
    await page.getByTestId("content-list-delete-confirm").click();

    expect(deleted[0]).toMatchObject({ id: 3 });
    await expect(page.getByTestId("content-list-row-3")).toHaveCount(0);
    await expect(page.getByTestId("toast-success")).toBeVisible();
  });

  test("failed mutation surfaces an error toast and keeps the row", async ({
    page,
  }) => {
    const TRASHED_ROW = entry({ id: 3, title: "Binned", status: "trash" });
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/list": [TRASHED_ROW],
    });
    await page.route("**/_plumix/rpc/entry/restore", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: rpcErrorBody({ code: "CONFLICT", message: "not_trashed" }),
      }),
    );

    await page.goto("entries/posts?status=trash");
    await page.getByTestId("content-list-row-3").hover();
    await page.getByTestId("content-list-row-restore-3").click();

    await expect(page.getByTestId("toast-error")).toBeVisible();
    await expect(page.getByTestId("content-list-row-3")).toBeVisible();
  });

  test("non-trash rows never surface Restore / Delete permanently", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/list": TWO_ROWS,
    });
    await page.goto("entries/posts");
    await page.getByTestId("content-list-row-1").hover();
    await expect(page.getByTestId("content-list-row-trash-1")).toBeVisible();
    await expect(page.getByTestId("content-list-row-restore-1")).toHaveCount(0);
    await expect(page.getByTestId("content-list-row-delete-1")).toHaveCount(0);
  });

  test("without create/delete caps: New button and Trash row action are absent", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": {
        user: {
          id: 5,
          email: "viewer@example.test",
          name: "Viewer",
          avatarUrl: null,
          role: "subscriber",
          // Read-only: no entry:post:create / entry:post:delete.
          capabilities: ["entry:post:read"],
        },
        needsBootstrap: false,
      },
      "/entry/list": TWO_ROWS,
    });

    await page.goto("entries/posts");
    await expect(page.getByTestId("content-list-row-1")).toBeVisible();
    await expect(page.getByTestId("content-list-new-button")).toHaveCount(0);
    await page.getByTestId("content-list-row-1").hover();
    await expect(page.getByTestId("content-list-row-trash-1")).toHaveCount(0);
  });
});

test.describe("/entries/$slug (list) — taxonomy filters", () => {
  // Entry type wired to one hierarchical taxonomy so the filter
  // dropdown renders; single consumer, so the manifest stays local.
  const MANIFEST_WITH_FILTERABLE_TAXONOMY: PlumixManifest = {
    ...emptyManifest(),
    entryTypes: [
      {
        name: "post",
        adminSlug: "posts",
        label: "Posts",
        labels: { singular: "Post", plural: "Posts" },
        termTaxonomies: ["category"],
      },
    ],
    termTaxonomies: [
      {
        name: "category",
        label: "Categories",
        labels: { singular: "Category" },
        isHierarchical: true,
      },
    ],
  };

  function term(overrides: Partial<Term> & { id: number; name: string }): Term {
    return {
      taxonomy: "category",
      slug: overrides.name.toLowerCase().replaceAll(" ", "-"),
      description: null,
      parentId: null,
      meta: {},
      version: 0,
      ...overrides,
    };
  }

  test("picking a term URL-syncs ?category= and ships termTaxonomies in the input", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_FILTERABLE_TAXONOMY);
    const inputs = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/list",
      captureResponse: [],
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/term/list": [
          term({ id: 1, name: "News" }),
          term({ id: 2, name: "Guides" }),
        ],
      },
    });

    await page.goto("entries/posts");
    await page.getByTestId("taxonomy-filter-category").click();
    await page.getByTestId("taxonomy-filter-category-option-news").click();

    await expect(page).toHaveURL(/category=news/);
    await expect
      .poll(
        () =>
          (
            inputs.at(-1) as
              | { termTaxonomies?: Record<string, string[]> }
              | undefined
          )?.termTaxonomies ?? null,
      )
      .toEqual({ category: ["news"] });
  });
});
