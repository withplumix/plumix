import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_META_BOXES,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
} from "./support/rpc-mock.js";

// All content-related e2e coverage lives here:
//   - /entries/$slug list (filters, search, sort, pagination, auth gates)
//   - /entries/$slug/new editor (toolbar, auto-slug, submit)
//   - /entries/$slug/$id editor (load existing, edit, meta-box sidebar)
// Ordering follows the user journey: list → new → edit.

test.describe("/entries/$slug", () => {
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

    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/entry/list")) {
        await pending;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: [], meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts?status=all&page=1");
    await expect(page.getByTestId("content-list-heading")).toBeVisible();
    await expect(page.getByTestId("data-table-loading")).toBeVisible();
    await expectNoAxeViolations(page);

    release?.();
  });

  test("renders empty state with zero WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/list": [],
    });
    await page.goto("entries/posts?status=all&page=1");
    await expect(page.getByTestId("content-list-heading")).toBeVisible();
    await expect(page.getByTestId("content-list-empty-state")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("renders the router's not-found state when the slug isn't registered", async ({
    page,
  }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    const response = await page.goto("entries/unknown-type?status=all&page=1");
    // TanStack Router's `notFound()` returns a 404-style render — not a
    // literal HTTP 404 since we're behind Vite's SPA dev server, so assert
    // the router's default "Not Found" marker instead.
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByTestId("not-found-page")).toBeVisible();
  });

  test("search box URL-syncs ?q= and triggers a refetch after debounce", async ({
    page,
  }) => {
    // Capture every /entry/list call so we can verify the second fetch
    // carries the search param. The mock always returns `[]` — we're
    // asserting on the RPC input, not the rendering.
    const inputs: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/entry/list")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        inputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: [], meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts?status=all&page=1");
    await page.getByTestId("content-list-search-input").fill("quantum");
    await expect(page).toHaveURL(/q=quantum/);
    // The debounced commit + refetch should eventually ship `search` in
    // the RPC input. Playwright's expect.poll waits up to 5s by default,
    // which covers the 250ms debounce comfortably.
    await expect
      .poll(
        () =>
          (inputs.at(-1) as { search?: string } | undefined)?.search ?? null,
      )
      .toBe("quantum");
  });

  test("Mine toggle URL-syncs author=mine and sends session.user.id as authorId", async ({
    page,
  }) => {
    const inputs: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/entry/list")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        inputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: [], meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts?status=all&page=1");
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

  test("column sort: clicking Title header sets orderBy=title and defaults to asc", async ({
    page,
  }) => {
    const inputs: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/entry/list")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        inputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: [], meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts?status=all&page=1");
    await page.getByTestId("content-list-sort-title").click();
    await expect(page).toHaveURL(/orderBy=title/);
    await expect(page).toHaveURL(/order=asc/);
    await expect
      .poll(
        () =>
          (inputs.at(-1) as { orderBy?: string } | undefined)?.orderBy ?? null,
      )
      .toBe("title");
  });

  test("renders rows with zero WCAG 2.1 AA violations", async ({ page }) => {
    const now = new Date("2026-04-19T12:00:00Z");
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/list": [
        {
          id: 1,
          type: "post",
          parentId: null,
          title: "Hello world",
          slug: "hello-world",
          content: null,
          excerpt: null,
          status: "published",
          authorId: 1,
          menuOrder: 0,
          meta: {},
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 2,
          type: "post",
          parentId: null,
          title: "Draft in progress",
          slug: "draft-in-progress",
          content: null,
          excerpt: null,
          status: "draft",
          authorId: 1,
          menuOrder: 0,
          meta: {},
          publishedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.goto("entries/posts?status=all&page=1");
    // Row id 1 was seeded by the mock above with title "Hello world" —
    // asserting the row exists + its content is enough without binding
    // to visible copy.
    const helloRow = page.getByTestId("content-list-row-1");
    await expect(helloRow).toBeVisible();
    await expect(helloRow).toContainText("Hello world");
    await expectNoAxeViolations(page);
  });
});

test.describe("/entries/$slug/new", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("auto-slug, toolbar, submit → creates post and redirects", async ({
    page,
  }) => {
    const createInputs: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/entry/create")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        createInputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              id: 42,
              type: "post",
              parentId: null,
              title: "Hello world",
              slug: "hello-world",
              content: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "body" }],
                  },
                ],
              },
              excerpt: null,
              status: "draft",
              authorId: 1,
              menuOrder: 0,
              publishedAt: null,
              createdAt: new Date("2026-04-21T00:00:00Z"),
              updatedAt: new Date("2026-04-21T00:00:00Z"),
              meta: {},
            },
            meta: [],
          }),
        });
      }
      if (url.endsWith("/entry/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              id: 42,
              type: "post",
              parentId: null,
              title: "Hello world",
              slug: "hello-world",
              content: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "body" }],
                  },
                ],
              },
              excerpt: null,
              status: "draft",
              authorId: 1,
              menuOrder: 0,
              publishedAt: null,
              createdAt: new Date("2026-04-21T00:00:00Z"),
              updatedAt: new Date("2026-04-21T00:00:00Z"),
              meta: {},
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/new");
    await expect(page.getByTestId("post-editor-headline")).toBeVisible();

    // Auto-slug from title while slug is still unlocked.
    await page.getByTestId("post-editor-title-input").fill("Hello World");
    await expect(page.getByTestId("post-editor-slug-input")).toHaveValue(
      "hello-world",
    );

    // Toolbar renders.
    await expect(page.getByTestId("post-editor-toolbar")).toBeVisible();
    await expect(page.getByTestId("post-editor-toolbar-bold")).toBeVisible();

    // Submit → post.create fires with the form values.
    await page.getByTestId("post-editor-submit").click();
    await expect
      .poll(
        () =>
          (createInputs.at(-1) as { title?: string; slug?: string } | undefined)
            ?.title ?? null,
      )
      .toBe("Hello World");
    expect((createInputs.at(-1) as { slug?: string } | undefined)?.slug).toBe(
      "hello-world",
    );

    // Redirects to the edit route of the new post.
    await expect(page).toHaveURL(/entries\/posts\/42/);
  });

  test("locked slug: once the user edits slug directly, title changes stop overwriting it", async ({
    page,
  }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.goto("entries/posts/new");

    await page.getByTestId("post-editor-title-input").fill("First title");
    await expect(page.getByTestId("post-editor-slug-input")).toHaveValue(
      "first-title",
    );

    // Explicitly edit slug → locks auto-derivation.
    await page.getByTestId("post-editor-slug-input").fill("custom-slug");
    await page.getByTestId("post-editor-title-input").fill("Changed title");
    await expect(page.getByTestId("post-editor-slug-input")).toHaveValue(
      "custom-slug",
    );
  });

  test("new-post screen passes axe (zero WCAG 2.1 AA violations)", async ({
    page,
  }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.goto("entries/posts/new");
    await expect(page.getByTestId("post-editor-headline")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("/entries/$slug/$id", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("loads an existing post via post.get, edits it, sends post.update", async ({
    page,
  }) => {
    const now = new Date("2026-04-21T00:00:00Z");
    const updateInputs: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/entry/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              id: 7,
              type: "post",
              parentId: null,
              title: "Original title",
              slug: "original",
              content:
                '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Original body"}]}]}',
              excerpt: null,
              status: "draft",
              authorId: 1,
              menuOrder: 0,
              publishedAt: null,
              createdAt: now,
              updatedAt: now,
              meta: {},
            },
            meta: [],
          }),
        });
      }
      if (url.endsWith("/entry/update")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        updateInputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              id: 7,
              type: "post",
              parentId: null,
              title: "Edited title",
              slug: "original",
              content:
                '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Original body"}]}]}',
              excerpt: null,
              status: "draft",
              authorId: 1,
              menuOrder: 0,
              publishedAt: null,
              createdAt: now,
              updatedAt: new Date("2026-04-21T01:00:00Z"),
              meta: {},
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/7");
    await expect(page.getByTestId("post-editor-headline")).toBeVisible();
    // Existing title populates from the loaded post.
    await expect(page.getByTestId("post-editor-title-input")).toHaveValue(
      "Original title",
    );
    // Edit title → slug stays locked (existing post).
    await page.getByTestId("post-editor-title-input").fill("Edited title");
    await expect(page.getByTestId("post-editor-slug-input")).toHaveValue(
      "original",
    );

    await page.getByTestId("post-editor-submit").click();
    await expect
      .poll(
        () =>
          (updateInputs.at(-1) as { id?: number; title?: string } | undefined)
            ?.title ?? null,
      )
      .toBe("Edited title");
    expect((updateInputs.at(-1) as { id?: number } | undefined)?.id).toBe(7);
  });
});

test.describe("meta-box sidebar", () => {
  test("all meta boxes render in the rail, fields are typable", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_META_BOXES);
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.goto("entries/posts/new");

    // Full-screen editor: every registered meta box lands in the right
    // rail. `box.location` is no longer honoured — all boxes are rail.
    const rail = page.getByTestId("meta-boxes-sidebar");
    await expect(rail.getByTestId("meta-box-seo")).toBeVisible();
    await expect(rail.getByTestId("meta-box-featured")).toBeVisible();

    // Text field in the seo box accepts input.
    const metaTitle = page.getByTestId("meta-box-field-meta_title-input");
    await metaTitle.fill("Hello meta");
    await expect(metaTitle).toHaveValue("Hello meta");

    // Checkbox in the featured box toggles.
    const featured = page.getByTestId("meta-box-field-is_featured-input");
    await expect(featured).not.toBeChecked();
    await featured.check();
    await expect(featured).toBeChecked();
  });

  test("submit forwards meta values on the post.create input, and hydrates them back on edit", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_META_BOXES);

    const createInputs: unknown[] = [];
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/entry/create")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        createInputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              id: 99,
              type: "post",
              parentId: null,
              title: "meta post",
              slug: "meta-post",
              content: null,
              excerpt: null,
              status: "draft",
              authorId: 1,
              menuOrder: 0,
              publishedAt: null,
              createdAt: new Date("2026-04-21T00:00:00Z"),
              updatedAt: new Date("2026-04-21T00:00:00Z"),
              meta: { meta_title: "seo title", is_featured: true },
            },
            meta: [],
          }),
        });
      }
      if (url.endsWith("/entry/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              id: 99,
              type: "post",
              parentId: null,
              title: "meta post",
              slug: "meta-post",
              content: null,
              excerpt: null,
              status: "draft",
              authorId: 1,
              menuOrder: 0,
              publishedAt: null,
              createdAt: new Date("2026-04-21T00:00:00Z"),
              updatedAt: new Date("2026-04-21T00:00:00Z"),
              meta: { meta_title: "seo title", is_featured: true },
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/new");
    await page.getByTestId("post-editor-title-input").fill("meta post");
    await page.getByTestId("meta-box-field-meta_title-input").fill("seo title");
    await page.getByTestId("meta-box-field-is_featured-input").check();
    await page.getByTestId("post-editor-submit").click();

    await expect
      .poll(() => (createInputs.at(-1) as { meta?: unknown } | undefined)?.meta)
      .toEqual({ meta_title: "seo title", is_featured: true });
    // Route advances to the edit page after save.
    await expect(page).toHaveURL(/entries\/posts\/99/);
    // The loaded post hydrates the meta inputs from `post.get`'s `meta` bag.
    await expect(
      page.getByTestId("meta-box-field-meta_title-input"),
    ).toHaveValue("seo title");
    await expect(
      page.getByTestId("meta-box-field-is_featured-input"),
    ).toBeChecked();
  });
});
