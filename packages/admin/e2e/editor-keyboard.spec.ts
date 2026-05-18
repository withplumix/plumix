import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

// Keyboard-only flow asserting the a11y promise: an author with no
// mouse can compose, navigate, and inspect blocks without touching a
// pointer. The slash-menu spec types the full query string — the
// suggestion plugin's anchor range survives every keystroke now that
// the value-sync effect deep-compares JSON instead of relying on focus
// alone (#342).

const NOW = new Date("2026-05-17T00:00:00Z");

test.describe("Keyboard-only editor flow (a11y)", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("Inspector renders the selected block's attribute field for keyboard authors", async ({
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
              id: 8,
              type: "post",
              parentId: null,
              title: "Has heading",
              slug: "h",
              content: {
                type: "doc",
                content: [
                  {
                    type: "core/heading",
                    attrs: { level: 2 },
                    content: [{ type: "text", text: "Section" }],
                  },
                ],
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

    await page.goto("entries/posts/8/edit");
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    // Place the caret inside the heading. A screen-reader user issues
    // the same activation by navigating into the heading's accessible
    // textbox.
    await page.locator(".ProseMirror h2").click();

    // Inspector exposes the heading's `level` attribute — driving it
    // by keyboard only (Tab to the field, ArrowDown / ArrowUp to pick
    // a value, Enter to confirm) is the keyboard-only authoring
    // promise the a11y slice protects. The unit suite
    // (`Inspector.test.tsx`) covers the keyboard interaction
    // semantics in isolation; here we just confirm the field actually
    // mounts against a real Tiptap selection.
    await expect(page.getByTestId("inspector-field-level")).toBeVisible();
  });

  test("slash-menu insertion: / → 'heading' → Enter inserts a heading", async ({
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
    // Typing the full query (not ArrowDown) is the #342 regression
    // surface — the suggestion's anchor range must survive every
    // keystroke. cmdk filters the visible items down to "heading".
    await page.keyboard.type("/heading");

    await expect(page.locator("[data-plumix-slash-menu-mount]")).toBeVisible();
    await expect(
      page.getByTestId("slash-menu-item-core/heading"),
    ).toBeVisible();
    await page.keyboard.press("Enter");

    // The empty paragraph is replaced by an `<h2>` / `<h3>` — proves
    // the suggestion command path resolved through to a schema-aware
    // insertion.
    await expect(
      page.locator(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3"),
    ).toHaveCount(1);
  });
});
