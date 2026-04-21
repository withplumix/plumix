import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_META_BOXES,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
} from "./support/rpc-mock.js";

test.describe("/content/$slug/new", () => {
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
      if (url.endsWith("/post/create")) {
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
              content: "<p>body</p>",
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
      if (url.endsWith("/post/get")) {
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
              content: "<p>body</p>",
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

    await page.goto("content/posts/new");
    await expect(page.getByTestId("post-editor-new-heading")).toBeVisible();

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
    await expect(page).toHaveURL(/content\/posts\/42/);
  });

  test("locked slug: once the user edits slug directly, title changes stop overwriting it", async ({
    page,
  }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.goto("content/posts/new");

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
    await page.goto("content/posts/new");
    await expect(page.getByTestId("post-editor-new-heading")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("/content/$slug/$id", () => {
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
      if (url.endsWith("/post/get")) {
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
              content: "<p>Original body</p>",
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
      if (url.endsWith("/post/update")) {
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
              content: "<p>Original body</p>",
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

    await page.goto("content/posts/7");
    await expect(page.getByTestId("post-editor-edit-heading")).toBeVisible();
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
  test("renders side + normal boxes, fields are typable", async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_META_BOXES);
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.goto("content/posts/new");

    // Both boxes render — one in the side rail, one in the main column.
    await expect(page.getByTestId("meta-box-seo")).toBeVisible();
    await expect(page.getByTestId("meta-box-featured")).toBeVisible();
    // Side rail container picks up only side-context boxes.
    const sideRail = page.getByTestId("meta-boxes-side");
    await expect(sideRail.getByTestId("meta-box-featured")).toBeVisible();
    await expect(sideRail.getByTestId("meta-box-seo")).toHaveCount(0);

    // Text field in the normal box accepts input.
    const metaTitle = page.getByTestId("meta-box-field-meta_title-input");
    await metaTitle.fill("Hello meta");
    await expect(metaTitle).toHaveValue("Hello meta");

    // Checkbox in the side box toggles.
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
      if (url.endsWith("/post/create")) {
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
      if (url.endsWith("/post/get")) {
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

    await page.goto("content/posts/new");
    await page.getByTestId("post-editor-title-input").fill("meta post");
    await page.getByTestId("meta-box-field-meta_title-input").fill("seo title");
    await page.getByTestId("meta-box-field-is_featured-input").check();
    await page.getByTestId("post-editor-submit").click();

    await expect
      .poll(() => (createInputs.at(-1) as { meta?: unknown } | undefined)?.meta)
      .toEqual({ meta_title: "seo title", is_featured: true });
    // Route advances to the edit page after save.
    await expect(page).toHaveURL(/content\/posts\/99/);
    // The loaded post hydrates the meta inputs from `post.get`'s `meta` bag.
    await expect(
      page.getByTestId("meta-box-field-meta_title-input"),
    ).toHaveValue("seo title");
    await expect(
      page.getByTestId("meta-box-field-is_featured-input"),
    ).toBeChecked();
  });
});
