// The mock harness can't serve the public route the canvas iframe loads, so
// these assert the client contracts the route owns, not canvas rendering.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import { emptyManifest } from "@plumix/core/manifest";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  dismissStarterModal,
  editorEntry,
  installEditorMocks,
  lastUpdate,
  publishedEntry,
  publishedEntryRpcBody,
  T0,
} from "./support/editor.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_EDITOR_PATTERNS,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
  mockRpcWithCapture,
  rpcErrorBody,
  rpcEtagConflictBody,
  rpcOkBody,
} from "./support/rpc-mock.js";

/**
 * The minted preview URL every editing-mode spec needs in the loader; without
 * it the route surfaces the error placeholder instead of the canvas.
 */
const PREVIEW_LINK = {
  token: "tok123",
  url: "/post/hello?preview=tok123",
} as const;

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await mockManifest(page, MANIFEST_WITH_POST);
});

test.describe("editor route", () => {
  test("mounts the canvas iframe pointed at the minted preview url with plumix.edit", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });

    await page.goto("entries/posts/1/edit");

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
      "/entry/createPreviewLink": PREVIEW_LINK,
    });

    await page.goto("entries/posts/1/edit");

    // Block selection arrives from inside the iframe, which the mock harness
    // can't serve.
    await expect(page.getByTestId("plumix-editor-right")).toBeVisible();
    await expect(page.getByTestId("block-inspector-empty")).toBeVisible();
  });

  test("mounts the left-rail block catalog", async ({ page }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });

    await page.goto("entries/posts/1/edit");

    // The empty-state "Add a block" renders inside the canvas iframe, which
    // the mock harness can't serve.
    await expect(page.getByTestId("plumix-editor-left")).toBeVisible();
    await expect(page.getByTestId("block-catalog-search")).toBeVisible();
    await expect(
      page.getByTestId("block-catalog-item-core/rich-text"),
    ).toBeVisible();
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
            {
              id: "h1",
              name: "core/rich-text",
              attrs: { body: "<h2>Hello</h2>" },
            },
            {
              id: "g1",
              name: "core/group",
              attrs: { content: [{ id: "p1", name: "core/rich-text" }] },
            },
          ],
        },
      }),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });

    await page.goto("entries/posts/1/edit");

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
              name: "core/button",
              attrs: { label: "Welcome" },
            },
          ],
        },
      }),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });

    await page.goto("entries/posts/1/edit");

    // Nothing edited yet — undo is disabled.
    await expect(page.getByTestId("plumix-undo")).toBeDisabled();

    // Select the button via the Layers tab and edit its Label in the inspector.
    await page.getByTestId("plumix-tab-layers").click();
    await page.getByTestId("layer-h1").click();
    const textField = page.getByTestId("block-input-label");
    await textField.fill("Changed");
    await expect(textField).toHaveValue("Changed");

    // Undo restores the original text; redo becomes available.
    await page.getByTestId("plumix-undo").click();
    await expect(page.getByTestId("block-input-label")).toHaveValue("Welcome");
    await expect(page.getByTestId("plumix-redo")).toBeEnabled();
  });

  test("the Page tab shows document settings and the source dialog shows the tree", async ({
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
              name: "core/rich-text",
              attrs: { body: "<h2>Hi</h2>" },
            },
          ],
        },
      }),
      "/entry/list": [],
      "/entry/createPreviewLink": PREVIEW_LINK,
    });

    await page.goto("entries/posts/1/edit");

    // Page tab hosts the admin-provided document settings (slug at minimum).
    await page.getByTestId("plumix-tab-page").click();
    await expect(page.getByTestId("entry-slug-input")).toHaveValue("entry-1");

    // The header's source-code action opens a modal with the whole-page tree.
    await page.getByTestId("plumix-view-source").click();
    await expect(page.getByTestId("json-source-dialog")).toBeVisible();
    await expect(page.getByTestId("json-inspector-output")).toContainText(
      '"h1"',
    );
  });

  test("a published autosave-type entry with a pending draft shows Discard + Publish", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          label: "Posts",
          labels: { singular: "Post", plural: "Posts" },
          supports: ["editor", "autosave"],
        },
      ],
    });
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/list": [],
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    // A pending autosave (equal timestamps = fresh, not stale). The dedicated
    // body builder encodes the `_preview` dates so the client revives them.
    await page.route("**/_plumix/rpc/entry/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: publishedEntryRpcBody(publishedEntry({ autosaveUpdatedAt: T0 })),
      }),
    );

    await page.goto("entries/posts/1/edit");

    // Draft mode: a pending autosave enables Publish, surfaces the
    // unpublished-changes cue, and offers Discard (revert to live). Staging is
    // continuous via autosave, so there is no separate Save action.
    await expect(page.getByTestId("plumix-editor-publish-button")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("editor-draft-publish")).toBeEnabled();
    await expect(page.getByTestId("editor-unpublished-changes")).toBeVisible();
    await expect(page.getByTestId("editor-draft-discard")).toBeEnabled();
    await expect(page.getByTestId("editor-draft-save")).toHaveCount(0);

    // Discarding can't be undone, so Discard only asks: cancelling sends
    // nothing, confirming sends the discard.
    const discards: string[] = [];
    await page.route("**/_plumix/rpc/entry/discardDraft", (route) => {
      discards.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: publishedEntryRpcBody(publishedEntry()),
      });
    });
    await page.getByTestId("editor-draft-discard").click();
    await page.getByTestId("editor-draft-discard-cancel").click();
    await expect(page.getByTestId("editor-draft-discard-confirm")).toHaveCount(
      0,
    );
    expect(discards).toHaveLength(0);

    const discarded = page.waitForRequest("**/_plumix/rpc/entry/discardDraft");
    await page.getByTestId("editor-draft-discard").click();
    await page.getByTestId("editor-draft-discard-confirm").click();
    await discarded;
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

    await page.goto("entries/posts/1/edit");

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

    await page.goto("entries/posts/1/edit");

    await expect(page.getByTestId("plumix-editor-error")).toBeVisible();
    await expect(page.getByTestId("plumix-canvas-frame")).toHaveCount(0);
  });
});

test.describe("editor chrome & layout", () => {
  test.beforeEach(async ({ page }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
  });

  test("the editor shell mounts the layout, canvas, and toolbar", async ({
    page,
  }) => {
    await page.goto("entries/posts/1/edit");

    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    // `plumix-editor-canvas` renders inside the iframe document (the public
    // route the mock can't serve); the host-side wrapper is the iframe frame.
    await expect(page.getByTestId("plumix-canvas-frame")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-toolbar")).toBeVisible();
  });

  test("the back button returns to the entry list", async ({ page }) => {
    await page.goto("entries/posts/1/edit");

    await page.getByTestId("plumix-editor-back").click();

    await page.waitForURL(/\/entries\/posts(\?|$)/);
    await expect(page.getByTestId("content-list-heading")).toBeVisible();
  });

  test("the canvas toolbar switches device and steps zoom", async ({
    page,
  }) => {
    await page.goto("entries/posts/1/edit");

    // Device switch sizes the canvas to the theme breakpoint widths.
    await page.getByTestId("plumix-device-tablet").click();

    // Zoom-in walks up the preset ladder and clamps at 200 %; zoom-out
    // reverses one step. The percent readout doubles as fit-to-width.
    const percent = page.getByTestId("plumix-zoom-percent");
    const zoomIn = page.getByTestId("plumix-zoom-in");
    for (let i = 0; i < 6; i++) await zoomIn.click();
    await expect(percent).toHaveText("200%");
    await page.getByTestId("plumix-zoom-out").click();
    await expect(percent).toHaveText("150%");
  });
});

test.describe("editor accessibility", () => {
  test("desktop editor chrome has no WCAG 2.1 AA violations from axe-core", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("the populated inspector (Block + Styles tabs) has no WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry({
        content: {
          version: "plumix.v2",
          blocks: [
            { id: "h1", name: "core/button", attrs: { label: "Welcome" } },
          ],
        },
      }),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();

    // The empty-chrome sweep never reaches the inspector's form controls.
    await page.getByTestId("plumix-tab-layers").click();
    await page.getByTestId("layer-h1").click();
    await expect(page.getByTestId("block-input-label")).toBeVisible();
    await expectNoAxeViolations(page);

    // The Styles tab's token / keyword / toggle controls are the bulk of the
    // inspector's fields; sweep them too.
    await page.getByTestId("plumix-tab-styles").click();
    await expect(page.getByTestId("styles-tab")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

// The canvas renders inside the iframe the mock harness can't serve, so the
// Layers tab, which reads the same tree, stands in for it.
test.describe("editor server-loaded content", () => {
  test("server-loaded plumix.v2 content surfaces in the Layers outline", async ({
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
              name: "core/rich-text",
              attrs: { body: "<h2>Hello from server</h2>" },
            },
            {
              id: "g1",
              name: "core/group",
              attrs: {
                content: [
                  {
                    id: "child-h",
                    name: "core/rich-text",
                    attrs: { body: "<h3>Inside group</h3>" },
                  },
                ],
              },
            },
          ],
        },
      }),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-layers").click();

    await expect(page.getByTestId("layer-h1")).toBeVisible();
    // The wrapper block's nested child is parsed and outlined too.
    await expect(page.getByTestId("layer-child-h")).toBeVisible();
  });
});

// Ported from "editor document tab". The document settings now live behind the
// Page tab (`plumix-tab-page`) instead of Puck's Document tab; the field
// testids + the orpc.entry.update envelope contracts are unchanged.
test.describe("editor document tab", () => {
  test("excerpt edits ride the autosave envelope", async ({ page }) => {
    // Excerpt is gated on the type's supports list — MANIFEST_WITH_POST has
    // none, so override with one that does.
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          label: "Posts",
          labels: { singular: "Post", plural: "Posts" },
          supports: ["title", "editor", "slug", "excerpt"],
        },
      ],
    });
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...editorEntry(), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry(),
        "/entry/list": [],
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();

    await page.getByTestId("entry-excerpt-input").fill("Hand-written summary");

    await expect
      .poll(
        () =>
          (captures.at(-1) as { excerpt?: string } | undefined)?.excerpt ??
          null,
      )
      .toBe("Hand-written summary");
    // Excerpt rides the normal autosave routing (the autosave-row patch
    // honors it) — no forced live write.
    expect(captures.at(-1)).not.toHaveProperty("saveAs");
  });

  test("editing the excerpt reloads the canvas preview", async ({ page }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          label: "Posts",
          labels: { singular: "Post", plural: "Posts" },
          supports: ["title", "editor", "slug", "excerpt"],
        },
      ],
    });
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...editorEntry(), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry(),
        "/entry/list": [],
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });
    // The excerpt renders into the theme's shell, which the bridge never
    // pushes, so the canvas has to load its page again.
    const previewLoads: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(PREVIEW_LINK.url))
        previewLoads.push(request.url());
    });
    await page.goto("entries/posts/1/edit");
    await expect.poll(() => previewLoads.length).toBe(1);
    await page.getByTestId("plumix-tab-page").click();

    await page.getByTestId("entry-excerpt-input").fill("Hand-written summary");

    await expect.poll(() => captures.length).toBe(1);
    await expect.poll(() => previewLoads.length).toBe(2);
  });

  test("editing only the slug leaves the canvas preview as it is", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          label: "Posts",
          labels: { singular: "Post", plural: "Posts" },
          supports: ["title", "editor", "slug", "excerpt"],
        },
      ],
    });
    await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...editorEntry(), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry(),
        "/entry/list": [],
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });
    // The canvas loads a token URL, so the slug never reaches it. The autosave
    // outwaits the reload's debounce, so a slug reload lands before the
    // excerpt save.
    const events: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(PREVIEW_LINK.url)) events.push("load");
      else if (request.url().endsWith("/entry/update"))
        events.push(
          request.postData()?.includes("excerpt")
            ? "save excerpt"
            : "save slug",
        );
    });
    await page.goto("entries/posts/1/edit");
    await expect.poll(() => events).toEqual(["load"]);
    await page.getByTestId("plumix-tab-page").click();

    await page.getByTestId("entry-slug-input").fill("custom-slug");
    await expect.poll(() => events).toEqual(["load", "save slug"]);
    await page.getByTestId("entry-excerpt-input").fill("Hand-written summary");

    await expect
      .poll(() => events)
      .toEqual(["load", "save slug", "save excerpt", "load"]);
  });

  test("excerpt input is absent when the type lacks excerpt support", async ({
    page,
  }) => {
    // MANIFEST_WITH_POST declares no supports list → no excerpt.
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();
    await expect(page.getByTestId("entry-slug-input")).toBeVisible();
    await expect(page.getByTestId("entry-excerpt-input")).toHaveCount(0);
  });

  test("clearing the excerpt ships null, not an empty string", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          label: "Posts",
          labels: { singular: "Post", plural: "Posts" },
          supports: ["title", "editor", "slug", "excerpt"],
        },
      ],
    });
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...editorEntry(), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": { ...editorEntry(), excerpt: "Seeded summary" },
        "/entry/list": [],
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();
    await page.getByTestId("entry-excerpt-input").clear();

    await expect
      .poll(() =>
        captures.some(
          (input) => (input as { excerpt?: unknown }).excerpt === null,
        ),
      )
      .toBe(true);
  });

  test("Page tab exposes the slug; editing it ships a live entry.update", async ({
    page,
  }) => {
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...editorEntry(), slug: "custom-slug", updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry(),
        "/entry/list": [],
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();

    const slug = page.getByTestId("entry-slug-input");
    await expect(slug).toHaveValue("entry-1");
    await slug.fill("custom-slug");

    await expect
      .poll(
        () => (captures.at(-1) as { slug?: string } | undefined)?.slug ?? null,
      )
      .toBe("custom-slug");
    // Structural fields must write the live row — the autosave-row patch
    // silently drops slug/parentId.
    const last = captures.at(-1) as { saveAs?: string; id?: number };
    expect(last.saveAs).toBe("live");
    expect(last.id).toBe(1);
  });

  test("Page tab exposes the title; editing it ships a live entry.update", async ({
    page,
  }) => {
    // Title is gated on the type's supports list — MANIFEST_WITH_POST has none.
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          label: "Posts",
          labels: { singular: "Post", plural: "Posts" },
          supports: ["title", "editor", "slug"],
        },
      ],
    });
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: {
        ...editorEntry(),
        title: "Hello world",
        updatedAt: T0,
      },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry({ title: "Untitled" }),
        "/entry/list": [],
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });

    await page.goto("entries/posts/1/edit");

    // The title lives in the always-visible header now, not the Page tab.
    const title = page.getByTestId("plumix-editor-title-input");
    await expect(title).toHaveValue("Untitled");
    await title.fill("Hello world");

    await expect
      .poll(
        () =>
          (captures.at(-1) as { title?: string } | undefined)?.title ?? null,
      )
      .toBe("Hello world");
    // Title is a structural field — it must write the live row.
    const last = captures.at(-1) as { saveAs?: string; id?: number };
    expect(last.saveAs).toBe("live");
    expect(last.id).toBe(1);
  });

  test("hierarchical types expose a parent picker; picking ships a live parentId", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          label: "Posts",
          labels: { singular: "Post", plural: "Posts" },
          supports: ["title", "editor", "slug"],
          isHierarchical: true,
        },
      ],
    });
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...editorEntry(), parentId: 2, updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry(),
        "/entry/list": [editorEntry(), editorEntry({ id: 2, title: "About" })],
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();

    const select = page.getByTestId("entry-parent-select");
    await expect(select).toBeVisible();
    await select.click();
    // The entry can't be its own parent — self (id 1) is excluded client-side.
    await expect(page.getByTestId("entry-parent-select-option-1")).toHaveCount(
      0,
    );

    await page.getByTestId("entry-parent-select-option-2").click();
    await expect
      .poll(
        () =>
          (captures.at(-1) as { parentId?: number } | undefined)?.parentId ??
          null,
      )
      .toBe(2);
    // Structural — must write the live row.
    expect((captures.at(-1) as { saveAs?: string }).saveAs).toBe("live");
  });

  test("parent picker is absent for non-hierarchical types", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();
    await expect(page.getByTestId("entry-slug-input")).toBeVisible();
    await expect(page.getByTestId("entry-parent-select")).toHaveCount(0);
  });

  test("entry metaboxes render in the Page tab and ride the autosave meta bag", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          label: "Posts",
          labels: { singular: "Post", plural: "Posts" },
          supports: ["title", "editor", "slug"],
        },
      ],
      entryMetaBoxes: [
        {
          id: "seo",
          label: "SEO",
          entryTypes: ["post"],
          fields: [
            {
              key: "meta_title",
              label: "Meta title",
              type: "string",
              inputType: "text",
              maxLength: 60,
            },
          ],
        },
      ],
    });
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...editorEntry(), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry(),
        "/entry/list": [],
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();

    await expect(page.getByTestId("entry-meta-box-seo")).toBeVisible();
    await page.getByTestId("meta-box-field-meta_title-input").fill("SEO title");

    await expect
      .poll(
        () =>
          (captures.at(-1) as { meta?: Record<string, unknown> } | undefined)
            ?.meta?.meta_title ?? null,
      )
      .toBe("SEO title");
    // Meta rides the normal autosave routing — the autosave-row patch merges
    // it over the live row's bag.
    expect(captures.at(-1)).not.toHaveProperty("saveAs");
  });

  test("editing a meta field leaves an undeclared meta key out of the autosave", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryMetaBoxes: [
        {
          id: "showcase",
          label: "Showcase",
          entryTypes: ["post"],
          fields: [
            {
              key: "subtitle",
              label: "Subtitle",
              type: "string",
              inputType: "text",
            },
          ],
        },
      ],
    });
    const captures = await installEditorMocks(page, {
      entry: {
        ...editorEntry(),
        meta: {
          subtitle: "old",
          featuredImage: { src: "/hero.jpg", alt: "Hero" },
        },
      },
      handlers: { "/entry/createPreviewLink": PREVIEW_LINK },
    });
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();

    await page.getByTestId("meta-box-field-subtitle-input").fill("new");

    await expect
      .poll(() => captures)
      .toEqual([expect.objectContaining({ meta: { subtitle: "new" } })]);
  });

  // A display-only renderer occupies a meta key it never writes, which must not
  // read as a change on open.
  test("opening an entry with stored meta sends no meta autosave", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          label: "Posts",
          labels: { singular: "Post", plural: "Posts" },
          supports: ["title", "editor", "slug", "excerpt"],
        },
      ],
      entryMetaBoxes: [
        {
          id: "showcase",
          label: "Showcase",
          entryTypes: ["post"],
          fields: [
            {
              key: "subtitle",
              label: "Subtitle",
              type: "string",
              inputType: "text",
            },
            {
              key: "card_preview",
              label: "Card",
              type: "json",
              inputType: "runtime-proof-sibling",
            },
          ],
        },
      ],
    });
    const captures = await installEditorMocks(page, {
      entry: { ...editorEntry(), meta: { subtitle: "old", accent: "#3366ff" } },
      handlers: { "/entry/createPreviewLink": PREVIEW_LINK },
    });
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();
    await expect(
      page.getByTestId("meta-box-field-card_preview-input-siblings"),
    ).toBeAttached();

    // The excerpt rides the same write as meta, so a meta change would join it.
    await page.getByTestId("entry-excerpt-input").fill("Summary");

    await expect
      .poll(() => captures)
      .toEqual([expect.objectContaining({ excerpt: "Summary" })]);
    expect(captures[0]).not.toHaveProperty("meta");
  });

  test("the template picker sends the chosen named template via the `template` field", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          label: "Posts",
          labels: { singular: "Post", plural: "Posts" },
          supports: ["title", "editor", "slug"],
          namedTemplates: [{ id: "landing", label: "Landing Page" }],
        },
      ],
    });
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...editorEntry(), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry(),
        "/entry/list": [],
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();

    await page.getByTestId("entry-template-select").click();
    // The list offers "(theme default)" plus each registered named template.
    await expect(
      page.getByTestId("entry-template-select-option-default"),
    ).toBeVisible();
    await expect(
      page.getByTestId("entry-template-select-option-landing"),
    ).toBeVisible();
    await page.getByTestId("entry-template-select-option-landing").click();

    await expect
      .poll(
        () =>
          (captures.at(-1) as { template?: string | null } | undefined)
            ?.template ?? null,
      )
      .toBe("landing");
    // The reserved key is NOT smuggled through the plugin meta bag — the
    // choice travels only via the dedicated `template` field.
    const last = captures.at(-1) as
      { meta?: Record<string, unknown> } | undefined;
    expect(last?.meta?.__plumix_template).toBeUndefined();
  });
});

test.describe("editor preview", () => {
  test("the preview menu offers the draft and live-entry options", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    await page.goto("entries/posts/1/edit");

    await page.getByTestId("plumix-preview-menu").click();

    // The draft link is always available; the live entry is gated on publish.
    await expect(page.getByTestId("plumix-preview-draft")).toBeVisible();
    await expect(page.getByTestId("plumix-preview-live")).toBeVisible();
  });
});

// Content edits arrive from inside the canvas iframe the mock can't serve.
test.describe("editor publishing & autosave", () => {
  test("clicking the Publish button POSTs entry.update with status: published", async ({
    page,
  }) => {
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: {
        ...editorEntry(),
        status: "published",
        publishedAt: T0,
        updatedAt: T0,
      },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry(),
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });
    await page.goto("entries/posts/1/edit");

    // The toolbar's trailing publish control sits under the expanded right
    // rail at this width; collapse both rails first so the click lands.
    await page.getByTestId("plumix-rails-toggle").click();
    const button = page.getByTestId("plumix-editor-publish-button");
    await expect(button).toBeEnabled();
    await button.click();

    await expect
      .poll(
        () =>
          (captures.at(-1) as { status?: string } | undefined)?.status ?? null,
      )
      .toBe("published");
    const lastInput = captures.at(-1) as {
      readonly id: number;
      readonly status: string;
      readonly content?: unknown;
      readonly ifMatch: string;
    };
    expect(lastInput.id).toBe(1);
    expect(lastInput.content).toBeUndefined();
    expect(lastInput.ifMatch).toBe("e0");
    await expect(page.getByTestId("toast-success")).toBeVisible();
  });

  test("Publish sends a pending edit first and publishes on the token it returned", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/list": [],
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    const updates: Record<string, unknown>[] = [];
    await page.route("**/_plumix/rpc/entry/update", (route) => {
      const input = (
        route.request().postDataJSON() as { json: Record<string, unknown> }
      ).json;
      updates.push(input);
      const body =
        input.status === "published"
          ? { ...editorEntry({ status: "published" }), etag: "e2" }
          : { ...editorEntry(), slug: "custom-slug", etag: "e1" };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(body),
      });
    });
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();

    // Publish inside the autosave debounce window, before the slug edit has
    // been sent on its own.
    await page.getByTestId("entry-slug-input").fill("custom-slug");
    await page.getByTestId("plumix-rails-toggle").click();
    await page.getByTestId("plumix-editor-publish-button").click();

    await expect.poll(() => updates.length).toBe(2);
    expect(updates[0]).toMatchObject({ slug: "custom-slug", ifMatch: "e0" });
    expect(updates[1]).toMatchObject({ status: "published", ifMatch: "e1" });
  });

  // One saved entry a second session can save, its `entry.update` checking
  // `ifMatch` as the server does.
  async function mockSavedEntry(page: Page): Promise<{
    readonly updates: Record<string, unknown>[];
    readonly saveElsewhere: (changes: Record<string, unknown>) => void;
  }> {
    let saved: Record<string, unknown> = editorEntry();
    let version = 0;
    const updates: Record<string, unknown>[] = [];
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/list": [],
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    await page.route("**/_plumix/rpc/entry/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(saved),
      }),
    );
    const save = (changes: Record<string, unknown>): void => {
      version += 1;
      saved = { ...saved, ...changes, etag: `e${String(version)}` };
    };
    await page.route("**/_plumix/rpc/entry/update", (route) => {
      const {
        ifMatch,
        id: _id,
        ...changes
      } = (route.request().postDataJSON() as { json: Record<string, unknown> })
        .json;
      updates.push({ ifMatch, ...changes });
      if (ifMatch !== saved.etag) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: rpcEtagConflictBody(
            String(saved.etag),
            new Date("2026-05-20T09:30:00Z"),
          ),
        });
      }
      save(changes);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(saved),
      });
    });
    return { updates, saveElsewhere: save };
  }

  test("an edit made after another session saved opens the conflict dialog, and Load theirs shows that save", async ({
    page,
  }) => {
    const { saveElsewhere } = await mockSavedEntry(page);
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();
    await expect(page.getByTestId("entry-slug-input")).toHaveValue("entry-1");
    saveElsewhere({ slug: "saved-elsewhere" });

    await page.getByTestId("entry-slug-input").fill("my-slug");

    await expect(page.getByTestId("entry-conflict-dialog")).toBeVisible();
    await page.getByTestId("entry-conflict-load-theirs").click();
    await expect(page.getByTestId("entry-conflict-dialog")).toBeHidden();
    await page.getByTestId("plumix-tab-page").click();
    await expect(page.getByTestId("entry-slug-input")).toHaveValue(
      "saved-elsewhere",
    );
  });

  test("Keep mine in the conflict dialog saves the local edit over the other session's", async ({
    page,
  }) => {
    const { updates, saveElsewhere } = await mockSavedEntry(page);
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();
    await expect(page.getByTestId("entry-slug-input")).toHaveValue("entry-1");
    saveElsewhere({ slug: "saved-elsewhere" });
    await page.getByTestId("entry-slug-input").fill("my-slug");
    await expect(page.getByTestId("entry-conflict-dialog")).toBeVisible();

    await page.getByTestId("entry-conflict-keep-mine").click();

    await expect(page.getByTestId("entry-conflict-dialog")).toBeHidden();
    await expect
      .poll(() => updates.at(-1))
      .toMatchObject({ ifMatch: "e1", slug: "my-slug" });
    // Only the refused save and the resend: a conflict is never retried.
    expect(updates).toHaveLength(2);
  });

  test("navigating away with a pending edit sends it", async ({ page }) => {
    const captures = await installEditorMocks(page, {
      handlers: {
        "/entry/list": [editorEntry()],
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });
    // Frozen, so the debounce can't send the edit: only leaving the route can.
    await page.clock.install();
    await page.goto("entries/posts");
    await page.getByTestId("content-list-row-1").click();
    await page.getByTestId("plumix-tab-page").click();
    await page.clock.pauseAt(new Date("2030-01-01T00:00:00Z"));

    await page.getByTestId("entry-slug-input").fill("left-behind");
    await page.goBack();

    await expect
      .poll(() => captures)
      .toEqual([expect.objectContaining({ slug: "left-behind" })]);
  });

  // Unloading the document (reload, tab close, a link off the admin) runs no
  // unmount, so the page itself holds the edit back.
  test("leaving the page with a pending edit sends it and asks to confirm", async ({
    page,
  }) => {
    const captures = await installEditorMocks(page, {
      handlers: { "/entry/createPreviewLink": PREVIEW_LINK },
    });
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-tab-page").click();
    await page.getByTestId("entry-slug-input").fill("left-behind");
    const asked = page.waitForEvent("dialog");

    await page.close({ runBeforeUnload: true });

    // The open prompt blocks the page's timers, so the debounce can't send it.
    const dialog = await asked;
    expect(dialog.type()).toBe("beforeunload");
    await expect
      .poll(() => captures)
      .toEqual([expect.objectContaining({ slug: "left-behind" })]);
    await dialog.accept();
  });

  test("a failed publish surfaces an error toast instead of failing silently", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    await page.route("**/_plumix/rpc/entry/update", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: rpcErrorBody({
          code: "CONFLICT",
          message: "Resource conflict",
        }),
      }),
    );
    await page.goto("entries/posts/1/edit");

    // Collapse the rails so the trailing publish control isn't under the right
    // rail (see the published-status spec).
    await page.getByTestId("plumix-rails-toggle").click();
    const button = page.getByTestId("plumix-editor-publish-button");
    await expect(button).toBeEnabled();
    await button.click();

    await expect(page.getByTestId("toast-error")).toBeVisible();
    // The entry stays unpublished, so the button must remain usable.
    await expect(button).toBeEnabled();
  });

  test("Publish button is disabled when the entry is already published", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": { ...editorEntry(), status: "published", publishedAt: T0 },
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    await page.goto("entries/posts/1/edit");

    await expect(
      page.getByTestId("plumix-editor-publish-button"),
    ).toBeDisabled();
  });
});

// The editor has no title input, so a pending draft is seeded via `_preview`.
test.describe("editor draft of a published entry", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          label: "Posts",
          labels: { singular: "Post", plural: "Posts" },
          supports: ["title", "editor", "autosave"],
        },
      ],
    });
  });

  async function mockPublishedEntry(
    page: Page,
    opts: { autosaveUpdatedAt: Date | null },
  ): Promise<void> {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    await page.route("**/_plumix/rpc/entry/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: publishedEntryRpcBody(
          publishedEntry({ autosaveUpdatedAt: opts.autosaveUpdatedAt }),
        ),
      }),
    );
  }

  test("published entry without an autosave: Publish disabled, no save/discard", async ({
    page,
  }) => {
    await mockPublishedEntry(page, { autosaveUpdatedAt: null });

    await page.goto("entries/posts/1/edit");
    // No pending draft → Publish is disabled; no unpublished-changes cue and
    // no separate save/discard exist.
    await expect(page.getByTestId("editor-draft-publish")).toBeDisabled();
    await expect(page.getByTestId("editor-unpublished-changes")).toHaveCount(0);
    await expect(page.getByTestId("editor-draft-save")).toHaveCount(0);
    await expect(page.getByTestId("editor-draft-discard")).toHaveCount(0);
    await expect(page.getByTestId("plumix-editor-publish-button")).toHaveCount(
      0,
    );
  });

  test("draft publish: a 409 surfaces an error toast, the retry a success toast", async ({
    page,
  }) => {
    const pristine = publishedEntry({ autosaveUpdatedAt: T0 });
    let publishAttempts = 0;
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/entry/publish")) {
        publishAttempts += 1;
        if (publishAttempts === 1) {
          return route.fulfill({
            status: 409,
            contentType: "application/json",
            body: rpcErrorBody({
              code: "CONFLICT",
              message: "Resource conflict",
            }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: pristine, meta: [] }),
        });
      }
      if (url.endsWith("/entry/createPreviewLink")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: PREVIEW_LINK, meta: [] }),
        });
      }
      if (url.endsWith("/entry/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: publishedEntryRpcBody(pristine),
        });
      }
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/1/edit");
    // Collapse the rails so the trailing draft controls aren't under the right
    // rail (see the published-status spec).
    await page.getByTestId("plumix-rails-toggle").click();
    const publish = page.getByTestId("editor-draft-publish");
    await expect(publish).toBeEnabled();

    await publish.click();
    await expect(page.getByTestId("toast-error")).toBeVisible();

    await publish.click();
    await expect(page.getByTestId("toast-success")).toBeVisible();
  });
});

test.describe("editor stale-draft dialog", () => {
  const T_LIVE = new Date("2026-05-22T12:00:00Z");
  const T_STALE = new Date("2026-05-22T10:00:00Z"); // before live
  const T_FRESH = new Date("2026-05-22T13:00:00Z"); // after live

  const MANIFEST_WITH_AUTOSAVE: PlumixManifest = {
    ...emptyManifest(),
    entryTypes: [
      {
        name: "post",
        capabilityType: "post",
        adminSlug: "posts",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
        label: "Posts",
        labels: { singular: "Post", plural: "Posts" },
        supports: ["title", "editor", "revisions", "autosave"],
      },
    ],
  };

  async function installAutosaveMocks(
    page: Page,
    opts: { autosaveUpdatedAt: Date | null },
  ): Promise<void> {
    await mockManifest(page, MANIFEST_WITH_AUTOSAVE);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    await page.route("**/_plumix/rpc/entry/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: publishedEntryRpcBody(
          publishedEntry({
            autosaveUpdatedAt: opts.autosaveUpdatedAt,
            liveUpdatedAt: T_LIVE,
          }),
        ),
      }),
    );
  }

  test("stale autosave: dialog fires at mount with the three actions", async ({
    page,
  }) => {
    await installAutosaveMocks(page, { autosaveUpdatedAt: T_STALE });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("stale-draft-dialog")).toBeVisible();
    await expect(page.getByTestId("stale-draft-use-mine")).toBeEnabled();
    await expect(page.getByTestId("stale-draft-use-theirs")).toBeEnabled();
    await expect(page.getByTestId("stale-draft-compare")).toBeEnabled();
  });

  test("fresh autosave (newer than live): no dialog", async ({ page }) => {
    await installAutosaveMocks(page, { autosaveUpdatedAt: T_FRESH });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("stale-draft-dialog")).toHaveCount(0);
  });

  test("no autosave: no dialog", async ({ page }) => {
    await installAutosaveMocks(page, { autosaveUpdatedAt: null });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("stale-draft-dialog")).toHaveCount(0);
  });

  test("Use mine dismisses the dialog and lets the editor proceed", async ({
    page,
  }) => {
    await installAutosaveMocks(page, { autosaveUpdatedAt: T_STALE });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("stale-draft-dialog")).toBeVisible();
    await page.getByTestId("stale-draft-use-mine").click();
    // The chosen-draft content lives only in the canvas iframe.
    await expect(page.getByTestId("stale-draft-dialog")).toHaveCount(0);
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
  });

  test("Use theirs discards the autosave, both choices disabled until it lands", async ({
    page,
  }) => {
    await installAutosaveMocks(page, { autosaveUpdatedAt: T_STALE });
    let release: (() => void) | undefined;
    const landed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const discards: unknown[] = [];
    await page.route("**/_plumix/rpc/entry/discardDraft", async (route) => {
      discards.push((route.request().postDataJSON() as { json: unknown }).json);
      await landed;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ id: 1 }),
      });
    });
    // The live row the editor reseeds from carries no pending autosave.
    await page.route("**/_plumix/rpc/entry/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: publishedEntryRpcBody(
          publishedEntry({
            autosaveUpdatedAt: discards.length === 0 ? T_STALE : null,
            liveUpdatedAt: T_LIVE,
          }),
        ),
      }),
    );
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("stale-draft-dialog")).toBeVisible();

    await page.getByTestId("stale-draft-use-theirs").click();

    await expect(page.getByTestId("stale-draft-use-mine")).toBeDisabled();
    await expect(page.getByTestId("stale-draft-use-theirs")).toBeDisabled();
    await expect.poll(() => discards).toEqual([{ id: 1 }]);
    release?.();
    await expect(page.getByTestId("stale-draft-dialog")).toHaveCount(0);
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
  });

  test("Compare expands an inline side-by-side JSON diff", async ({ page }) => {
    await installAutosaveMocks(page, { autosaveUpdatedAt: T_STALE });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("stale-draft-dialog")).toBeVisible();
    await page.getByTestId("stale-draft-compare").click();
    await expect(page.getByTestId("stale-draft-compare-panes")).toBeVisible();
  });
});

test.describe("editor revision preview", () => {
  const T_REV0 = new Date("2026-05-22T00:00:00Z");
  const T_REV = new Date("2026-05-22T10:00:00Z");

  const MANIFEST_WITH_REVISIONS: PlumixManifest = {
    ...emptyManifest(),
    entryTypes: [
      {
        name: "post",
        capabilityType: "post",
        adminSlug: "posts",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
        label: "Posts",
        labels: { singular: "Post", plural: "Posts" },
        supports: ["title", "editor", "revisions"],
      },
    ],
  };

  function liveEntry(): Record<string, unknown> {
    return {
      id: 1,
      type: "post",
      parentId: null,
      title: "Live title",
      slug: "entry-1",
      content: null,
      excerpt: null,
      status: "draft",
      authorId: 1,
      sortOrder: 0,
      publishedAt: null,
      createdAt: T_REV0,
      updatedAt: T_REV0,
      meta: {},
      etag: "rev0",
    };
  }

  function revisionRow(): Record<string, unknown> {
    return {
      id: 42,
      type: "_rev:post",
      parentId: null,
      title: "Snapshot title",
      slug: "rev:1:42",
      content: { version: "plumix.v2", blocks: [] },
      excerpt: null,
      status: "draft",
      authorId: 1,
      sortOrder: 0,
      publishedAt: null,
      createdAt: T_REV,
      updatedAt: T_REV,
      meta: {},
      authorName: "Ada Lovelace",
      authorEmail: "ada@example.test",
    };
  }

  function entryBody(entry: Record<string, unknown>): string {
    return JSON.stringify({
      json: entry,
      meta: [
        [1, "createdAt"],
        [1, "updatedAt"],
      ],
    });
  }

  async function installPreviewMocks(page: Page): Promise<void> {
    await mockManifest(page, MANIFEST_WITH_REVISIONS);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    await page.route("**/_plumix/rpc/entry/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: entryBody(liveEntry()),
      }),
    );
    await page.route("**/_plumix/rpc/entry/revisions/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: entryBody(revisionRow()),
      }),
    );
    await page.route("**/_plumix/rpc/entry/revisions/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: {
            revisions: [
              {
                id: 42,
                title: "Snapshot title",
                updatedAt: T_REV,
                authorId: 1,
                authorName: "Ada Lovelace",
                authorEmail: "ada@example.test",
                message: null,
              },
            ],
            nextCursor: null,
          },
          meta: [[1, "revisions", 0, "updatedAt"]],
        }),
      }),
    );
  }

  test("?revision=N renders the preview banner in read-only mode", async ({
    page,
  }) => {
    await installPreviewMocks(page);
    await page.goto("entries/posts/1/edit?revision=42");
    const banner = page.getByTestId("revision-preview-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Ada Lovelace");
    // Read-only mode renders no editing chrome (no toolbar / publish button).
    await expect(page.getByTestId("plumix-editor-publish-button")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("plumix-editor-toolbar")).toHaveCount(0);
  });

  test("Back to live clears the search param and restores editing chrome", async ({
    page,
  }) => {
    await installPreviewMocks(page);
    await page.goto("entries/posts/1/edit?revision=42");
    await expect(page.getByTestId("revision-preview-banner")).toBeVisible();
    await page.getByTestId("revision-preview-back-to-live").click();
    await expect.poll(() => page.url()).not.toContain("revision=");
    await expect(page.getByTestId("revision-preview-banner")).toHaveCount(0);
    await expect(
      page.getByTestId("plumix-editor-publish-button"),
    ).toBeVisible();
  });

  // Regression guard for #1559: the visual editor's header must carry the
  // revision-history trigger (it was dropped in the Puck-removal refactor), and
  // selecting a row must open that revision via `?revision=<id>`.
  test("the header Revisions button opens the sheet and a row previews a revision", async ({
    page,
  }) => {
    await installPreviewMocks(page);
    await page.goto("entries/posts/1/edit");
    const trigger = page.getByTestId("revisions-sheet-trigger");
    // The visual editor uses the compact icon variant (an icon-only button
    // labelled via aria-label), not the plain-form's text button — guards
    // against the wiring dropping `triggerVariant: "icon"`.
    await expect(trigger).toHaveAttribute("aria-label", "Revisions");
    await trigger.click();
    const row = page.getByTestId("revisions-sheet-item-42-select");
    await expect(row).toContainText("Snapshot title");
    await expect(row).toContainText("Ada Lovelace");
    await row.click();
    await expect.poll(() => page.url()).toContain("revision=42");
    await expect(page.getByTestId("revision-preview-banner")).toBeVisible();
    await expect(page.getByTestId("revisions-sheet-list")).toHaveCount(0);
  });

  test("the command palette's Revisions command opens the revisions sheet", async ({
    page,
  }) => {
    await installPreviewMocks(page);
    await page.goto("entries/posts/1/edit");
    // Pressing before the layout mounts races the palette's key listener.
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+KeyK");
    await page.getByTestId("plumix-command-revisions.open").click();

    await expect(page.getByTestId("revisions-sheet-item-42")).toBeVisible();
  });

  test("a row's diff icon fetches both snapshots and opens the diff modal", async ({
    page,
  }) => {
    await installPreviewMocks(page);
    const snapshotRequests: unknown[] = [];
    await page.route("**/_plumix/rpc/entry/revisions/get", (route) => {
      snapshotRequests.push(
        (route.request().postDataJSON() as { json: unknown }).json,
      );
      return route.fallback();
    });
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("revisions-sheet-trigger").click();
    await expect(page.getByTestId("revisions-sheet-item-42")).toBeVisible();
    expect(snapshotRequests).toEqual([]);

    await page.getByTestId("revisions-sheet-item-42-diff").click();

    const modal = page.getByTestId("revision-diff-modal");
    await expect(modal).toContainText("Snapshot title");
    await expect(modal).toContainText("Live title");
    expect(snapshotRequests).toEqual([{ revisionId: 42 }]);
  });

  test("a failed snapshot fetch shows the diff modal's error state", async ({
    page,
  }) => {
    await installPreviewMocks(page);
    await page.route("**/_plumix/rpc/entry/revisions/get", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: rpcErrorBody({ code: "INTERNAL_SERVER_ERROR" }),
      }),
    );
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("revisions-sheet-trigger").click();

    await page.getByTestId("revisions-sheet-item-42-diff").click();

    await expect(page.getByTestId("revision-diff-modal-error")).toBeVisible();
  });

  // One Escape dismisses only the topmost Radix layer.
  test("Escape closes the open diff modal, then the revisions sheet, leaving no modal behind", async ({
    page,
  }) => {
    await installPreviewMocks(page);
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("revisions-sheet-trigger").click();
    await page.getByTestId("revisions-sheet-item-42-diff").click();
    await expect(page.getByTestId("revision-diff-modal")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("revision-diff-modal")).toHaveCount(0);
    await expect(page.getByTestId("revisions-sheet-list")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("revisions-sheet-list")).toHaveCount(0);
    await expect(page.getByTestId("revision-diff-modal")).toHaveCount(0);
  });

  test("Load more fetches the next page of revisions from the previous cursor", async ({
    page,
  }) => {
    await installPreviewMocks(page);
    const pageRequests: unknown[] = [];
    await page.route("**/_plumix/rpc/entry/revisions/list", (route) => {
      const input = (
        route.request().postDataJSON() as {
          json: { readonly cursor: string | null };
        }
      ).json;
      pageRequests.push(input);
      const revision =
        input.cursor === null
          ? { id: 42, title: "Snapshot title", nextCursor: "cursor-42" }
          : { id: 41, title: "Older snapshot", nextCursor: null };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: {
            revisions: [
              {
                id: revision.id,
                title: revision.title,
                updatedAt: T_REV,
                authorId: 1,
                authorName: "Ada Lovelace",
                authorEmail: "ada@example.test",
                message: null,
              },
            ],
            nextCursor: revision.nextCursor,
          },
          meta: [[1, "revisions", 0, "updatedAt"]],
        }),
      });
    });
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("revisions-sheet-trigger").click();
    await expect(page.getByTestId("revisions-sheet-item-42")).toBeVisible();

    await page.getByTestId("revisions-sheet-load-more").click();

    await expect(page.getByTestId("revisions-sheet-item-41")).toContainText(
      "Older snapshot",
    );
    expect(pageRequests).toEqual([
      { entryId: 1, cursor: null },
      { entryId: 1, cursor: "cursor-42" },
    ]);
  });

  test("a revision comment saved from the sheet shows inline in its row", async ({
    page,
  }) => {
    await installPreviewMocks(page);
    const saved: { revisionId: number; message: string | null }[] = [];
    await page.route("**/_plumix/rpc/entry/revisions/setMessage", (route) => {
      saved.push(
        (
          route.request().postDataJSON() as {
            json: { revisionId: number; message: string | null };
          }
        ).json,
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ ok: true }),
      });
    });
    await page.route("**/_plumix/rpc/entry/revisions/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: {
            revisions: [
              {
                id: 42,
                title: "Snapshot title",
                updatedAt: T_REV,
                authorId: 1,
                authorName: "Ada Lovelace",
                authorEmail: "ada@example.test",
                message: saved.at(-1)?.message ?? null,
              },
            ],
            nextCursor: null,
          },
          meta: [[1, "revisions", 0, "updatedAt"]],
        }),
      }),
    );
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("revisions-sheet-trigger").click();
    await page.getByTestId("revisions-sheet-item-42-comment").click();
    await page
      .getByTestId("revisions-sheet-item-42-comment-input")
      .fill("  Fixed the typo ");

    await page.getByTestId("revisions-sheet-item-42-comment-save").click();

    await expect(
      page.getByTestId("revisions-sheet-item-42-comment-display"),
    ).toHaveText("Fixed the typo");
    expect(saved).toEqual([{ revisionId: 42, message: "Fixed the typo" }]);
    await page.getByTestId("revisions-sheet-item-42-comment").click();
    await expect(
      page.getByTestId("revisions-sheet-item-42-comment-input"),
    ).toHaveValue("Fixed the typo");
    await page.getByTestId("revisions-sheet-item-42-comment-cancel").click();
    await expect(
      page.getByTestId("revisions-sheet-item-42-comment-editor"),
    ).toHaveCount(0);
    expect(saved).toHaveLength(1);
  });

  test("Restore from the preview banner restores the revision, and a stale restore shows the conflict inline", async ({
    page,
  }) => {
    await installPreviewMocks(page);
    let release: (() => void) | undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    const restores: unknown[] = [];
    await page.route(
      "**/_plumix/rpc/entry/revisions/restore",
      async (route) => {
        restores.push(
          (route.request().postDataJSON() as { json: unknown }).json,
        );
        if (restores.length > 1) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: entryBody(liveEntry()),
          });
        }
        await answered;
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: rpcEtagConflictBody("rev1", T_REV),
        });
      },
    );
    await page.goto("entries/posts/1/edit?revision=42");
    const restore = page.getByTestId("revision-preview-restore");

    await restore.click();

    await expect(restore).toBeDisabled();
    release?.();
    await expect(
      page.getByTestId("revision-preview-restore-error"),
    ).toBeVisible();
    await restore.click();
    await expect.poll(() => page.url()).not.toContain("revision=");
    await expect(page.getByTestId("revision-preview-banner")).toHaveCount(0);
    expect(restores).toEqual([
      { revisionId: 42, ifMatch: "rev0" },
      { revisionId: 42, ifMatch: "rev0" },
    ]);
  });
});

// Ported from "editor collaboration & presence" — DROPPED. The editor
// has no co-author/presence indicator (no `coauthor-indicator` surface and no
// activity polling in the route), so there is nothing to assert here.

// Ported from "editor create failure". The create route (`/entries/$slug/
// create`) mints a draft then redirects to `/edit`; a 409 surfaces the retry
// affordance, and the retry redirects into the editor canvas.
test.describe("editor create failure", () => {
  test("a failed create surfaces an error and retry recovers", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": editorEntry(),
      "/entry/list": [],
      "/entry/createPreviewLink": PREVIEW_LINK,
    });
    // First create 409s (the slug-collision shape); the retry succeeds.
    let attempts = 0;
    await page.route("**/_plumix/rpc/entry/create", (route) => {
      attempts += 1;
      if (attempts === 1) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: rpcErrorBody({
            code: "CONFLICT",
            message: "Resource conflict",
            data: { reason: "slug_taken" },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: editorEntry(), meta: [] }),
      });
    });

    await page.goto("entries/posts");
    await page.getByTestId("content-list-new-button").click();
    await expect(page.getByTestId("create-entry-error")).toBeVisible();

    await page.getByTestId("create-entry-retry").click();
    await page.waitForURL(/\/entries\/posts\/\d+\/edit/);
    // The editor mounted: its host-side canvas frame is present (the inner
    // `plumix-editor-canvas` lives inside the iframe the mock can't serve).
    await expect(page.getByTestId("plumix-canvas-frame")).toBeVisible();
  });
});

test.describe("editor starter modal", () => {
  test("creating an entry of a type with starter patterns opens the modal", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    await installEditorMocks(page, {
      handlers: {
        "/entry/create": editorEntry(),
        "/entry/createPreviewLink": PREVIEW_LINK,
      },
    });

    await page.goto("entries/posts");
    await page.getByTestId("content-list-new-button").click();
    await page.waitForURL(/\/entries\/posts\/\d+\/edit/);

    await expect(page.getByTestId("plumix-starter-modal")).toBeVisible();
    // `target` and `entryTypes` survive the manifest projection: `e2e/hero`
    // carries both, `e2e/promo` carries neither and must not be offered.
    await expect(
      page.getByTestId("plumix-starter-modal-card-e2e/hero"),
    ).toBeVisible();
    await expect(
      page.getByTestId("plumix-starter-modal-card-e2e/promo"),
    ).toHaveCount(0);
  });

  test("Start from blank dismisses the modal and leaves the draft empty", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    const captures = await installEditorMocks(page, {
      handlers: { "/entry/createPreviewLink": PREVIEW_LINK },
    });

    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    // The escape lands on a working editor, not a blocked screen.
    await expect(page.getByTestId("plumix-canvas-frame")).toBeVisible();
    // Autosave ships only dirtied fields, so forcing one with a title edit and
    // finding no `content` proves the blank start seeded nothing.
    await page.getByTestId("plumix-editor-title-input").fill("Blank start");
    await expect
      .poll(() => lastUpdate(captures)?.title ?? null)
      .toBe("Blank start");
    expect(lastUpdate(captures)?.content).toBeUndefined();
  });

  test("choosing a starter autosaves the pattern's blocks into the draft", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    const captures = await installEditorMocks(page, {
      handlers: { "/entry/createPreviewLink": PREVIEW_LINK },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-starter-modal-card-e2e/hero").click();
    await expect(page.getByTestId("plumix-starter-modal")).toBeHidden();

    await expect
      .poll(() =>
        (lastUpdate(captures)?.content?.blocks ?? []).map(
          (block) => block.name,
        ),
      )
      .toEqual(["core/rich-text", "core/rich-text"]);
  });

  test("Pick a starter re-opens the modal on an empty entry", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    await installEditorMocks(page, {
      handlers: { "/entry/createPreviewLink": PREVIEW_LINK },
    });
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    await page.getByTestId("plumix-editor-replace-starter").click();

    await expect(page.getByTestId("plumix-starter-modal")).toBeVisible();
  });

  // Inherits the file-level MANIFEST_WITH_POST, which registers no patterns.
  test("an entry type with no starter patterns skips the modal", async ({
    page,
  }) => {
    await installEditorMocks(page, {
      handlers: { "/entry/createPreviewLink": PREVIEW_LINK },
    });

    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-canvas-frame")).toBeVisible();
    await expect(page.getByTestId("plumix-starter-modal")).toHaveCount(0);
  });
});
