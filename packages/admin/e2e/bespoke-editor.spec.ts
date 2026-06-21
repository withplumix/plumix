// The bespoke visual editor is opt-in: its own `/editor` route (the Puck
// `/edit` route stays the default). The mock harness can't run the real
// public route the canvas iframe loads, so these specs assert the client
// contracts the route owns: the canvas shell mounts pointed at the minted
// preview URL with `plumix.edit` flipped on, and either load failure (entry
// or mint) surfaces the error placeholder instead of a dead canvas.

import { expect, test } from "@playwright/test";

import { editorEntry } from "./support/editor.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
} from "./support/rpc-mock.js";

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await mockManifest(page, MANIFEST_WITH_POST);
});

test.describe("bespoke editor route", () => {
  test("mounts the canvas iframe pointed at the minted preview url with plumix.edit", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/createPreviewLink": {
        token: "tok123",
        url: "/post/hello?preview=tok123",
      },
    });

    await page.goto("entries/posts/1/editor");

    await expect(page.getByTestId("plumix-canvas-frame")).toBeVisible();
    const iframe = page.getByTestId("plumix-canvas-frame").locator("iframe");
    // The relative mint resolves to the admin's own origin; the gate boots
    // the editor runtime on `plumix.edit`, and `preview` carries draft
    // visibility through to the public render.
    const src = await iframe.getAttribute("src");
    expect(src).toContain("/post/hello");
    expect(src).toContain("preview=tok123");
    expect(src).toMatch(/[?&]plumix\.edit(=|&|$)/);
  });

  test("mounts the right-rail attribute inspector alongside the canvas", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/createPreviewLink": {
        token: "tok123",
        url: "/post/hello?preview=tok123",
      },
    });

    await page.goto("entries/posts/1/editor");

    // The mock harness can't serve the public route the canvas iframe loads,
    // so block selection (which arrives from inside the iframe) can't fire
    // here — the host-side edit→autosave loop is covered by the package unit
    // tests. This asserts the inspector rail mounts with the registry wired,
    // showing its empty state until a block is selected.
    await expect(page.getByTestId("plumix-editor-right")).toBeVisible();
    await expect(page.getByTestId("block-inspector-empty")).toBeVisible();
  });

  test("mounts the left-rail block catalog and the empty-state affordance", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/createPreviewLink": {
        token: "tok123",
        url: "/post/hello?preview=tok123",
      },
    });

    await page.goto("entries/posts/1/editor");

    // The catalog lists the core blocks the registry ships, searchable.
    await expect(page.getByTestId("plumix-editor-left")).toBeVisible();
    await expect(page.getByTestId("block-catalog-search")).toBeVisible();
    await expect(
      page.getByTestId("block-catalog-item-core/heading"),
    ).toBeVisible();
    // A fresh (content-less) entry offers the "Add a block" affordance.
    await expect(page.getByTestId("plumix-empty-add")).toBeVisible();
  });

  test("the Layers tab outlines the entry's nested block structure", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry({
        content: {
          version: "plumix.v2",
          blocks: [
            { id: "h1", name: "core/heading", attrs: { text: "Hello" } },
            {
              id: "g1",
              name: "core/group",
              attrs: { content: [{ id: "p1", name: "core/rich-text" }] },
            },
          ],
        },
      }),
      "/entry/createPreviewLink": {
        token: "tok123",
        url: "/post/hello?preview=tok123",
      },
    });

    await page.goto("entries/posts/1/editor");

    await page.getByTestId("plumix-tab-layers").click();
    await expect(page.getByTestId("layer-h1")).toBeVisible();
    await expect(page.getByTestId("layer-g1")).toBeVisible();
    // The nested child appears in the outline too.
    await expect(page.getByTestId("layer-p1")).toBeVisible();
  });

  test("undo reverts an inspector edit and re-enables redo", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry({
        content: {
          version: "plumix.v2",
          blocks: [
            {
              id: "h1",
              name: "core/heading",
              attrs: { level: 2, text: "Welcome" },
            },
          ],
        },
      }),
      "/entry/createPreviewLink": {
        token: "tok123",
        url: "/post/hello?preview=tok123",
      },
    });

    await page.goto("entries/posts/1/editor");

    // Nothing edited yet — undo is disabled.
    await expect(page.getByTestId("plumix-undo")).toBeDisabled();

    // Select the heading via the Layers tab and edit its Text in the inspector.
    await page.getByTestId("plumix-tab-layers").click();
    await page.getByTestId("layer-h1").click();
    const textField = page.getByTestId("block-input-text");
    await textField.fill("Changed");
    await expect(textField).toHaveValue("Changed");

    // Undo restores the original text; redo becomes available.
    await page.getByTestId("plumix-undo").click();
    await expect(page.getByTestId("block-input-text")).toHaveValue("Welcome");
    await expect(page.getByTestId("plumix-redo")).toBeEnabled();
  });

  test("the Page tab shows document settings and the JSON tab shows the tree", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry({
        content: {
          version: "plumix.v2",
          blocks: [{ id: "h1", name: "core/heading", attrs: { text: "Hi" } }],
        },
      }),
      "/entry/list": [],
      "/entry/createPreviewLink": {
        token: "tok123",
        url: "/post/hello?preview=tok123",
      },
    });

    await page.goto("entries/posts/1/editor");

    // Page tab hosts the admin-provided document settings (slug at minimum).
    await page.getByTestId("plumix-tab-page").click();
    await expect(page.getByTestId("entry-slug-input")).toHaveValue("entry-1");

    // JSON tab renders the whole-page tree.
    await page.getByTestId("plumix-tab-json").click();
    await expect(page.getByTestId("json-inspector-output")).toContainText(
      '"h1"',
    );
  });

  test("a failed preview mint surfaces the error placeholder, not a dead canvas", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
    });
    await page.route("**/_plumix/rpc/entry/createPreviewLink", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          json: { code: "CONFLICT", message: "no_public_url" },
          meta: [],
        }),
      }),
    );

    await page.goto("entries/posts/1/editor");

    await expect(page.getByTestId("plumix-editor-error")).toBeVisible();
    await expect(page.getByTestId("plumix-canvas-frame")).toHaveCount(0);
  });

  test("an unreadable entry surfaces the error placeholder, not a dead canvas", async ({
    page,
  }) => {
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/get", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          json: { code: "NOT_FOUND", message: "entry" },
          meta: [],
        }),
      }),
    );

    await page.goto("entries/posts/1/editor");

    await expect(page.getByTestId("plumix-editor-error")).toBeVisible();
    await expect(page.getByTestId("plumix-canvas-frame")).toHaveCount(0);
  });
});
