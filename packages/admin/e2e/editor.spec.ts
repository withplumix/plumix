import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  AUTHED_ADMIN,
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
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("content/posts/new");
    await expect(
      page.getByRole("heading", { name: /new post/i }),
    ).toBeVisible();

    // Auto-slug from title while slug is still unlocked.
    await page.getByRole("textbox", { name: "Title" }).fill("Hello World");
    await expect(page.getByRole("textbox", { name: "Slug" })).toHaveValue(
      "hello-world",
    );

    // Toolbar button exists and is togglable.
    await expect(
      page.getByRole("button", { name: "Bold", exact: true }),
    ).toBeVisible();

    // Submit → post.create fires with the form values.
    await page.getByRole("button", { name: "Create" }).click();
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

    await page.getByRole("textbox", { name: "Title" }).fill("First title");
    await expect(page.getByRole("textbox", { name: "Slug" })).toHaveValue(
      "first-title",
    );

    // Explicitly edit slug → locks auto-derivation.
    await page.getByRole("textbox", { name: "Slug" }).fill("custom-slug");
    await page.getByRole("textbox", { name: "Title" }).fill("Changed title");
    await expect(page.getByRole("textbox", { name: "Slug" })).toHaveValue(
      "custom-slug",
    );
  });

  test("new-post screen passes axe (zero WCAG 2.1 AA violations)", async ({
    page,
  }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.goto("content/posts/new");
    await expect(
      page.getByRole("heading", { name: /new post/i }),
    ).toBeVisible();
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
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("content/posts/7");
    await expect(
      page.getByRole("heading", { name: /edit post/i }),
    ).toBeVisible();
    // Existing title populates from the loaded post.
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Original title",
    );
    // Edit title → slug stays locked (existing post).
    await page.getByRole("textbox", { name: "Title" }).fill("Edited title");
    await expect(page.getByRole("textbox", { name: "Slug" })).toHaveValue(
      "original",
    );

    await page.getByRole("button", { name: "Save" }).click();
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
