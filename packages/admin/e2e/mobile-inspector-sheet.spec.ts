import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

// Mobile (< 768px) flow for #314: the right-rail Inspector folds into
// a bottom Sheet. Authors open it via the per-block "Block settings"
// trigger that sits next to the drag handle on touch widths. Desktop
// is unchanged and covered by the existing keyboard suite.

const T0 = new Date("2026-05-18T00:00:00Z");

test.describe("Mobile Inspector bottom sheet (#314)", () => {
  test.use({ viewport: { width: 480, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("trigger opens the sheet; level change reflects in the editor", async ({
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
              id: 21,
              type: "post",
              parentId: null,
              title: "Mobile",
              slug: "m",
              content: {
                type: "doc",
                content: [
                  {
                    type: "core/heading",
                    attrs: { level: 2 },
                    content: [{ type: "text", text: "Title" }],
                  },
                ],
              },
              excerpt: null,
              status: "draft",
              authorId: 1,
              sortOrder: 0,
              publishedAt: null,
              createdAt: T0,
              updatedAt: T0,
              meta: {},
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/21/edit");
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    // Select the heading — the drag-handle wrapper anchors to it and
    // the mobile-only Inspector trigger renders alongside.
    await page.locator(".ProseMirror h2").click();
    const trigger = page.getByTestId("mobile-inspector-trigger");
    await expect(trigger).toBeVisible();

    // Tap opens the bottom sheet. The right-rail Inspector remains
    // hidden at this width — the Sheet is the only Inspector surface.
    await trigger.click();
    const sheet = page.getByTestId("mobile-inspector-sheet");
    await expect(sheet).toBeVisible();

    // The Inspector inside the sheet still drives `updateAttributes`
    // through the same editor — changing level retargets the tag in
    // the live canvas behind the sheet.
    const levelSelect = sheet.getByTestId("inspector-field-level");
    await expect(levelSelect).toBeVisible();
    await levelSelect.selectOption({ value: "4" });
    await expect(page.locator(".ProseMirror h4")).toHaveCount(1);
  });
});
