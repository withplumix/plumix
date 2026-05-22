import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

const T0 = new Date("2026-05-20T00:00:00Z");

function emptyEntry(id: number): Record<string, unknown> {
  return {
    id,
    type: "post",
    parentId: null,
    title: "Untitled",
    slug: `entry-${String(id)}`,
    content: null,
    excerpt: null,
    status: "draft",
    authorId: 1,
    sortOrder: 0,
    publishedAt: null,
    createdAt: T0,
    updatedAt: T0,
    meta: {},
  };
}

test.describe("v2 editor: keyboard-only walkthrough", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/entry/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: emptyEntry(1), meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });
  });

  test("/, type, Enter inserts a block via keyboard alone", async ({
    page,
  }) => {
    await page.goto("entries/posts/1/edit");

    const canvas = page.getByTestId("plumix-editor-canvas");
    await canvas.focus();
    await page.keyboard.press("/");
    await page.keyboard.type("paragraph");
    // Confirm the filter narrowed to the expected item before Enter —
    // a future block adding "paragraph" to its keywords could otherwise
    // silently change which spec gets inserted while this still passes.
    await expect(
      page.getByTestId("slash-menu-item-core/rich-text"),
    ).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(canvas.locator("p")).toHaveCount(1);
  });

  test("Escape closes the slash menu without inserting", async ({ page }) => {
    await page.goto("entries/posts/1/edit");

    await page.getByTestId("plumix-editor-canvas").focus();
    await page.keyboard.press("/");
    await expect(page.getByTestId("slash-menu-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("slash-menu-dialog")).toBeHidden();
  });
});
