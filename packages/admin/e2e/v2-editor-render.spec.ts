import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

test.describe("V2 spike editor renders end-to-end", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });
  });

  test("desktop chrome renders: header, left sidebar tabs, canvas, right sidebar tabs", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("v2/entries/posts/1/edit");

    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-header")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-title-input")).toBeVisible();
    await expect(page.getByTestId("plumix-autosave-pill")).toBeVisible();
    await expect(page.getByTestId("plumix-autosave-pill")).toHaveText("Saved");
    await expect(page.getByTestId("plumix-editor-publish-button")).toBeVisible();

    await expect(page.getByTestId("plumix-editor-left")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-tab-blocks")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-tab-outline")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-tab-audit")).toBeVisible();

    await expect(page.getByTestId("plumix-editor-canvas")).toBeVisible();

    await expect(page.getByTestId("plumix-editor-right")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-tab-block")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-tab-style")).toBeVisible();

    await expect(
      page.getByTestId("plumix-editor-mobile-blocks-trigger"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("plumix-editor-mobile-inspector-trigger"),
    ).toHaveCount(0);
  });

  test("mobile chrome collapses both sidebars into floating sheet triggers", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto("v2/entries/posts/1/edit");

    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-canvas")).toBeVisible();

    await expect(page.getByTestId("plumix-editor-left")).toHaveCount(0);
    await expect(page.getByTestId("plumix-editor-right")).toHaveCount(0);

    await expect(
      page.getByTestId("plumix-editor-mobile-blocks-trigger"),
    ).toBeVisible();
    await expect(
      page.getByTestId("plumix-editor-mobile-inspector-trigger"),
    ).toBeVisible();
  });

  test("slash menu opens on the canvas when '/' is pressed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("v2/entries/posts/1/edit");

    const canvas = page.getByTestId("plumix-editor-canvas");
    await canvas.focus();
    await page.keyboard.press("/");

    await expect(page.getByTestId("slash-menu-dialog")).toBeVisible();
  });
});
