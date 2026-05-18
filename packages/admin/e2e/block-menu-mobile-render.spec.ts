import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

// Regression guard for the mobile popover-render bug surfaced during
// #361: Tiptap's drag-handle plugin fires `onNodeChange(null)` (mouse
// left the block area) right after our keyboard/touch handler sets
// the tracked node, clobbering it before the popover renders BlockMenu.
// PlumixDragHandle now ignores the plugin's anchor updates while
// `open` is true.

const T0 = new Date("2026-05-18T00:00:00Z");

async function mockEntry(page: Page, id: number): Promise<void> {
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
            id,
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
}

test.describe("BlockMenu popover renders at <768px (#314)", () => {
  test.use({ viewport: { width: 480, height: 800 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("Mod-Alt-ArrowLeft surfaces the BlockMenu over the caret block", async ({
    page,
  }) => {
    await mockEntry(page, 44);
    await page.goto("entries/posts/44/edit");
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    await page.locator(".ProseMirror h2").click();

    const isMac = await page.evaluate(() => /Mac/i.test(navigator.platform));
    await page.keyboard.press(`${isMac ? "Meta" : "Control"}+Alt+ArrowLeft`);

    await expect(page.locator("[data-plumix-block-menu]")).toBeVisible();
    await expect(
      page.getByTestId("block-menu-transform-core/paragraph"),
    ).toBeVisible();
  });

  test("touch long-press surfaces the BlockMenu over the caret block", async ({
    page,
  }) => {
    await mockEntry(page, 45);
    await page.goto("entries/posts/45/edit");
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    await page.locator(".ProseMirror h2").click();

    // Synthesise touchstart on .ProseMirror — the long-press timer
    // fires after 500ms regardless of touchend.
    await page.evaluate(() => {
      const dom = document.querySelector<HTMLElement>(".ProseMirror");
      if (!dom) throw new Error(".ProseMirror not found");
      const rect = dom.getBoundingClientRect();
      const event = new Event("touchstart", { bubbles: true });
      Object.defineProperty(event, "touches", {
        value: [{ clientX: rect.left + 20, clientY: rect.top + 20 }],
      });
      dom.dispatchEvent(event);
    });

    await expect(page.locator("[data-plumix-block-menu]")).toBeVisible();
  });
});
