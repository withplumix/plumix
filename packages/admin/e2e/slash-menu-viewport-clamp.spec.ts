import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

const NOW = new Date("2026-05-18T00:00:00Z");

test.describe("Slash menu — viewport clamping at small widths (#314)", () => {
  test.use({ viewport: { width: 480, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("mount stays inside the 480px viewport", async ({ page }) => {
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
    await page.keyboard.type("/");

    const mount = page.locator("[data-plumix-slash-menu-mount]");
    await expect(mount).toBeVisible();

    const box = await mount.boundingBox();
    if (!box) throw new Error("slash-menu mount has no bounding box");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(480);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
  });
});
