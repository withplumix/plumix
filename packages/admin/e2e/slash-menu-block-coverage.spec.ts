import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

// Parametric regression: insert each insertable core block via the
// slash menu, type a payload where applicable, and assert the
// rendered DOM matches the expected element. Catches schema /
// defaultInnerBlocks drift that silently degrades to a paragraph.

const T0 = new Date("2026-05-18T00:00:00Z");

interface BlockCase {
  /** Slash-menu testid suffix. */
  readonly item: string;
  /** Substring typed into the slash menu input. */
  readonly query: string;
  /** Optional content typed after insertion (skip for atoms). */
  readonly payload?: string;
  /** CSS selector inside `.ProseMirror` that should match after insert. */
  readonly selector: string;
  /** Optional text the selector's first match should contain. */
  readonly text?: string;
}

const CASES: readonly BlockCase[] = [
  {
    item: "core/paragraph",
    query: "paragraph",
    payload: "Body text",
    selector: ".ProseMirror p",
    text: "Body text",
  },
  {
    item: "core/heading",
    query: "heading",
    payload: "Section",
    selector: ".ProseMirror h1, .ProseMirror h2, .ProseMirror h3",
    text: "Section",
  },
  {
    item: "core/list",
    query: "bulleted",
    payload: "Item",
    selector: ".ProseMirror ul[data-plumix-block='core/list'] li",
    text: "Item",
  },
  {
    item: "core/list-ordered",
    query: "numbered",
    payload: "Item",
    selector: ".ProseMirror ol[data-plumix-block='core/list-ordered'] li",
    text: "Item",
  },
  {
    item: "core/quote",
    query: "quote",
    payload: "Quoted",
    selector: ".ProseMirror blockquote[data-plumix-block='core/quote']",
    text: "Quoted",
  },
  {
    item: "core/code",
    query: "code",
    payload: "code",
    selector: ".ProseMirror pre[data-plumix-block='core/code']",
    text: "code",
  },
  {
    item: "core/separator",
    query: "separator",
    selector: ".ProseMirror hr[data-plumix-block='core/separator']",
  },
  {
    item: "core/group",
    query: "group",
    selector: ".ProseMirror div[data-plumix-block='core/group']",
  },
  {
    item: "core/table",
    query: "table",
    selector: ".ProseMirror table[data-plumix-block='core/table']",
  },
];

async function mockEmpty(page: Page, id: number): Promise<void> {
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
            title: "Coverage",
            slug: "c",
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
}

test.describe("slash menu inserts every core block", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("Enter on an empty list-item lifts the caret out of the list", async ({
    page,
  }) => {
    await mockEmpty(page, 4000);
    await page.goto("entries/posts/4000/edit");
    await expect(page.getByTestId("post-editor-form")).toBeVisible();
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("/bulleted");
    await page.keyboard.press("Enter");
    await page.keyboard.type("First");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second");
    // Now press Enter on an empty trailing item — should escape the
    // list and land in a paragraph below it.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Outside");

    // Two list items kept; "Outside" lives in a paragraph that is
    // a sibling of the list, not inside it.
    await expect(
      page.locator(".ProseMirror ul[data-plumix-block='core/list'] li"),
    ).toHaveCount(2);
    const lastP = page.locator(".ProseMirror > p").last();
    await expect(lastP).toContainText("Outside");
  });

  for (const [i, c] of CASES.entries()) {
    test(`${c.item} renders the right element after slash insert`, async ({
      page,
    }) => {
      await mockEmpty(page, 3000 + i);
      await page.goto(`entries/posts/${String(3000 + i)}/edit`);
      await expect(page.getByTestId("post-editor-form")).toBeVisible();
      await page.locator(".ProseMirror").click();
      await page.keyboard.type(`/${c.query}`);
      await expect(page.getByTestId(`slash-menu-item-${c.item}`)).toBeVisible();
      await page.keyboard.press("Enter");
      if (c.payload) {
        await page.keyboard.type(c.payload);
      }
      await expect(page.locator(c.selector).first()).toBeVisible();
      if (c.text) {
        await expect(page.locator(c.selector).first()).toContainText(c.text);
      }
    });
  }
});
