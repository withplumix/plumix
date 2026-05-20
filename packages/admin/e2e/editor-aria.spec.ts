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

// Plumix-specific ARIA contract assertions. Role/parent-child checks are
// covered by axe in v2-editor-render.spec.ts; this spec pins only the
// attributes plumix itself sets (testid-anchored elements + their
// aria-selected / aria-label values).
test.describe("v2 editor ARIA semantics", () => {
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

  test("left sidebar tab triggers carry role=tab + aria-selected reflecting active tab", async ({
    page,
  }) => {
    await page.goto("v2/entries/posts/1/edit");
    const blocksTab = page.getByTestId("plumix-editor-tab-blocks");
    const outlineTab = page.getByTestId("plumix-editor-tab-outline");
    const auditTab = page.getByTestId("plumix-editor-tab-audit");
    await expect(blocksTab).toHaveAttribute("role", "tab");
    await expect(blocksTab).toHaveAttribute("aria-selected", "true");
    await expect(outlineTab).toHaveAttribute("aria-selected", "false");
    await expect(auditTab).toHaveAttribute("aria-selected", "false");
  });

  test("slash menu input carries the aria-label that screen readers announce", async ({
    page,
  }) => {
    await page.goto("v2/entries/posts/1/edit");
    await page.getByTestId("plumix-editor-canvas").focus();
    await page.keyboard.press("/");
    await expect(page.getByTestId("slash-menu-input")).toHaveAttribute(
      "aria-label",
      "Search blocks",
    );
  });
});
