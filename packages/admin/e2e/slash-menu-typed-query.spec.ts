import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

const NOW = new Date("2026-05-17T00:00:00Z");

test.describe("Slash menu — typed query keeps the mount alive (#342)", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("typing `/heading` keeps the mount visible across every keystroke", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/**", async (route) => {
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
          body: JSON.stringify({
            json: {
              id: 9,
              type: "post",
              parentId: null,
              title: "Empty",
              slug: "e",
              content: {
                type: "doc",
                content: [{ type: "core/paragraph", content: [] }],
              },
              excerpt: null,
              status: "draft",
              authorId: 1,
              sortOrder: 0,
              publishedAt: null,
              createdAt: NOW,
              updatedAt: NOW,
              meta: {},
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/9/edit");
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    await page.locator(".ProseMirror").click();

    // Per-keystroke visibility — the regression was a mount-disappears
    // mid-typing, so the assertion needs to fire on every character to
    // pinpoint the offending keystroke if it ever reappears.
    const mount = page.locator("[data-plumix-slash-menu-mount]");
    for (const ch of "/heading") {
      await page.keyboard.press(ch === "/" ? "Slash" : ch);
      await expect(mount).toBeVisible();
    }
    await expect(
      page.getByTestId("slash-menu-item-core/heading"),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(
      page.locator(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3"),
    ).toHaveCount(1);
  });
});
