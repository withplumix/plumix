import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

// Regression for the wrapper-block slash-menu bug surfaced 2026-05-18:
// inserting `core/list` / `core/list-ordered` / `core/quote` /
// `core/columns` from the slash menu produced a paragraph because the
// Tiptap schemas require non-optional children and the slash payload
// shipped no content. Each spec now declares `defaultInnerBlocks` so
// items-from-registry materialises a valid empty body.

const T0 = new Date("2026-05-18T00:00:00Z");

const CASES = [
  {
    item: "core/list",
    query: "list",
    expect: { selector: "ul", tag: "UL" },
  },
  {
    item: "core/list-ordered",
    query: "numbered",
    expect: { selector: "ol", tag: "OL" },
  },
  {
    item: "core/quote",
    query: "quote",
    expect: { selector: "blockquote", tag: "BLOCKQUOTE" },
  },
] as const;

test.describe("slash menu inserts valid wrapper blocks", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  for (const c of CASES) {
    test(`${c.item} produces <${c.expect.selector}>`, async ({ page }) => {
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
                title: "Probe",
                slug: "p",
                content: {
                  type: "doc",
                  content: [{ type: "core/paragraph", content: [] }],
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

      await page.goto("entries/posts/9/edit");
      await expect(page.getByTestId("post-editor-form")).toBeVisible();
      await page.locator(".ProseMirror").click();
      await page.keyboard.type(`/${c.query}`);
      await expect(page.getByTestId(`slash-menu-item-${c.item}`)).toBeVisible();
      await page.keyboard.press("Enter");
      await page.keyboard.type("Hello");

      const tag = await page.evaluate((selector) => {
        const el = document.querySelector(`.ProseMirror ${selector}`);
        return el?.tagName ?? null;
      }, c.expect.selector);
      expect(tag).toBe(c.expect.tag);
    });
  }
});
