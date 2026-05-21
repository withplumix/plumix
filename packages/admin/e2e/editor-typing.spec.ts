// The CI-green cutover landed an editor whose canvas had no real typing
// coverage — slash-menu insert + sidebar styling passed, but no test
// actually typed into a richtext field on the canvas. This spec closes
// that hole: insert a paragraph, type into it, assert the autosave
// envelope reaches entry.update with the typed text and the server
// answers OK (no 500, no INVALID_BLOCK_CONTENT).

import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpcWithCapture,
  rpcOkBody,
} from "./support/rpc-mock.js";

const T0 = new Date("2026-05-21T00:00:00Z");

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

test.describe("v2 editor: typing into a richtext block", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("typing into a paragraph block updates attrs.body and autosaves a valid envelope", async ({
    page,
  }) => {
    const updateInputs = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...emptyEntry(1), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": emptyEntry(1),
      },
    });

    await page.goto("entries/posts/1/edit");

    const canvas = page.getByTestId("plumix-editor-canvas");
    await canvas.focus();
    await page.keyboard.press("/");
    await page.keyboard.type("paragraph");
    await expect(
      page.getByTestId("slash-menu-item-core/paragraph"),
    ).toBeVisible();
    await page.keyboard.press("Enter");

    // The paragraph was inserted; wait for autosave to dispatch the
    // envelope. The very act of insertion should fire entry.update —
    // this is the chokepoint where a 500 would surface.
    await expect(canvas.locator("p")).toHaveCount(1);

    // Wait for the debounced autosave to fire. The envelope is the
    // single chokepoint where the cutover regressions surface: an
    // unsanitised richtext doc, a missing block name, or a malformed
    // attrs map all land here.
    await expect
      .poll(() => updateInputs.length, { timeout: 5000 })
      .toBeGreaterThan(0);

    const last = updateInputs.at(-1) as
      | {
          id?: number;
          title?: string;
          content?: {
            version?: string;
            blocks?: readonly { name?: string; attrs?: unknown }[];
          };
        }
      | undefined;
    expect(last?.content?.version).toBe("plumix.v2");
    const blocks = last?.content?.blocks ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]?.name).toBe("core/paragraph");

    // The autosave pill flips back to "saved" once the server returns
    // OK. If the server 500s, the pill stays on "error".
    await expect(page.getByTestId("plumix-autosave-pill")).toHaveText("Saved");
  });

  test("editing the title fires entry.update with the new title", async ({
    page,
  }) => {
    const updateInputs = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...emptyEntry(1), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": emptyEntry(1),
      },
    });

    await page.goto("entries/posts/1/edit");

    const titleInput = page.getByTestId("plumix-editor-title-input");
    await expect(titleInput).toBeVisible();
    await titleInput.fill("My new title");

    await expect
      .poll(() => updateInputs.length, { timeout: 5000 })
      .toBeGreaterThan(0);

    const last = updateInputs.at(-1) as { title?: string } | undefined;
    expect(last?.title).toBe("My new title");
  });

  test("canvas toolbar zooms and switches viewport", async ({ page }) => {
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

    await page.goto("entries/posts/1/edit");

    // The toolbar ships Mobile (360) / Tablet (768) / Desktop (1280)
    // presets. The editor mounts on Desktop via a one-shot effect; the
    // active button exposes data-active="true" — this is the chokepoint
    // where the dispatch shape would silently break.
    const desktop = page.getByTestId("plumix-editor-viewport-1280");
    await expect(desktop).toHaveAttribute("data-active", "true");

    const tablet = page.getByTestId("plumix-editor-viewport-768");
    await tablet.click();
    await expect(tablet).toHaveAttribute("data-active", "true");
    await expect(desktop).toHaveAttribute("data-active", "false");

    // The canvas opens at fit-to-screen, which varies with the canvas
    // column width — pinning a specific initial percentage is brittle.
    // Walk up to the max preset (button disables itself at 200 %),
    // then step back down to 150 % to verify the direction reverses.
    const percent = page.getByTestId("plumix-editor-zoom-percent");
    const zoomIn = page.getByTestId("plumix-editor-zoom-in");
    for (let i = 0; i < 6 && (await zoomIn.isEnabled()); i++) {
      await zoomIn.click();
    }
    await expect(percent).toHaveText("200%");
    await page.getByTestId("plumix-editor-zoom-out").click();
    await expect(percent).toHaveText("150%");
  });

  test("back button navigates to the entries list", async ({ page }) => {
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

    await page.goto("entries/posts/1/edit");

    const back = page.getByTestId("plumix-editor-back-button");
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/entries/posts");
  });
});
