// The bespoke visual editor now owns the `/edit` route (Puck is gone).
// Editor *behavior* (block insertion, slash menu,
// selection/actions, field/rich-text editing, patterns) lives in the
// @plumix/admin-editor playground e2e + unit tests; this suite is INTEGRATION
// only — the route wiring and the orpc glue the route owns.
//
// The mock harness can't run the real public route the canvas iframe loads, so
// canvas-render assertions aren't possible here. The specs assert the client
// contracts the route owns instead: the canvas shell mounts pointed at the
// minted preview URL with `plumix.edit` flipped on; the right rails + host
// panels mount; load/mint failure surfaces the error placeholder; the
// document/page tab fields, publish/draft mutations, stale-draft + revision
// surfaces, and create-failure recovery all reach the right entry.* envelopes.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import { emptyManifest } from "@plumix/core/manifest";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  editorEntry,
  publishedEntry,
  publishedEntryRpcBody,
  T0,
} from "./support/editor.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
  mockRpcWithCapture,
  rpcErrorBody,
} from "./support/rpc-mock.js";

// The minted preview URL every editing-mode spec needs in the loader; without
// it the route surfaces the error placeholder instead of the canvas.
const PREVIEW_LINK = {
  token: "tok123",
  url: "/post/hello?preview=tok123",
} as const;

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

    // The mock harness can't serve the public route the canvas iframe loads,
    // so block selection (which arrives from inside the iframe) can't fire
    // here — the host-side edit→autosave loop is covered by the package unit
    // tests. This asserts the inspector rail mounts with the registry wired,
    // showing its empty state until a block is selected.
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

    // The catalog lists the core blocks the registry ships, searchable. The
    // empty-state "Add a block" affordance now renders inside the canvas iframe
    // (the mock harness can't serve that route — see above), so it's covered by
    // the admin-editor unit + playground layers, not here.
    await expect(page.getByTestId("plumix-editor-left")).toBeVisible();
    await expect(page.getByTestId("block-catalog-search")).toBeVisible();
    await expect(
      page.getByTestId("block-catalog-item-core/heading"),
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
            { id: "h1", name: "core/heading", attrs: { text: "Hello" } },
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
              name: "core/heading",
              attrs: { level: 2, text: "Welcome" },
            },
          ],
        },
      }),
      "/entry/createPreviewLink": PREVIEW_LINK,
    });

    await page.goto("entries/posts/1/edit");

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

  test("the Page tab shows document settings and the source dialog shows the tree", async ({
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

  test("a published autosave-type entry with a pending draft enables Publish", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          adminSlug: "posts",
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

    // Draft mode: the header shows just Publish (staging is via autosave, so
    // there's no separate save/discard); a pending autosave enables it.
    await expect(page.getByTestId("plumix-editor-publish-button")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("editor-draft-publish")).toBeEnabled();
    await expect(page.getByTestId("editor-draft-save")).toHaveCount(0);
    await expect(page.getByTestId("editor-draft-discard")).toHaveCount(0);
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

// Ported from the old Puck suite ("editor chrome & layout"). The bespoke
// shell has no mobile-sheet triggers, viewport-preset buttons, or a back
// button (navigation back to the list is the entries-list route's concern,
// covered there) — dropped, no equivalent. The genuine chrome wiring that
// survives is the toolbar's device switch + zoom controls.
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

// Ported from "editor accessibility". The mobile inspector-sheet a11y sweep
// and the Puck-shell ARIA tab pins are dropped — the bespoke shell has no
// mobile sheet, and its tab triggers are vendored radix primitives (their
// roles are covered by the axe sweep below, not re-asserted by hand).
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
});

// Ported from "editor server-loaded content". The plumix.v2 canvas render +
// word-count assertions can't run here (the canvas renders inside the iframe
// the mock harness can't serve, and the bespoke shell has no word-count
// readout). The surviving integration contract — that server-loaded content
// is parsed and surfaced by the route — is asserted through the Layers tab,
// which reads the same tree the canvas would.
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
              name: "core/heading",
              attrs: { level: 2, text: "Hello from server" },
            },
            {
              id: "g1",
              name: "core/group",
              attrs: {
                content: [
                  {
                    id: "child-h",
                    name: "core/heading",
                    attrs: { level: 3, text: "Inside group" },
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
          adminSlug: "posts",
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
          adminSlug: "posts",
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
          adminSlug: "posts",
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
          adminSlug: "posts",
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
    // The entry can't be its own parent — self is excluded client-side.
    await expect(select.locator("option[value='1']")).toHaveCount(0);

    await select.selectOption({ label: "About" });
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
          adminSlug: "posts",
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
});

// The header's preview menu (eye icon) offers the current draft and the live
// entry. The host mints the draft URL in the loader and feeds it in as
// `previewLink`; "View live entry" stays disabled until the entry is published.
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

// Ported from "editor publishing & autosave". The autosave-pill cycle, title
// edits, and block-insertion-driven autosave assertions are dropped — the
// bespoke shell has no autosave pill or title input, and content edits arrive
// from inside the canvas iframe the mock can't serve (that loop is covered by
// the @plumix/admin-editor package tests). The publish-button → entry.update
// wiring + failure handling survive as integration contracts.
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
      readonly expectedLiveUpdatedAt: string;
    };
    expect(lastInput.id).toBe(1);
    expect(lastInput.content).toBeUndefined();
    expect(lastInput.expectedLiveUpdatedAt).toBe(T0.toISOString());
    await expect(page.getByTestId("toast-success")).toBeVisible();
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
          message: "stale_expected_updated_at",
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

// Ported from "editor draft of a published entry". The existing "draft
// save/publish/discard" route spec above already covers the pending-autosave
// surfaces; these add the discard + publish-409-retry orpc wiring. The Puck
// "edit the title → banner appears" variants are dropped — the bespoke shell
// has no title input, so a pending draft is seeded via `_preview` instead.
test.describe("editor draft of a published entry", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_POST,
      entryTypes: [
        {
          name: "post",
          adminSlug: "posts",
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
    // No pending draft → Publish is disabled; no separate save/discard exist.
    await expect(page.getByTestId("editor-draft-publish")).toBeDisabled();
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
              message: "stale_expected_updated_at",
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

// Ported from "editor stale-draft dialog". The StaleDraftDialog component +
// testids are unchanged. The Puck "Use mine keeps the title value" assertion
// is dropped (no title input); the dialog dismissal is asserted instead.
test.describe("editor stale-draft dialog", () => {
  const T_LIVE = new Date("2026-05-22T12:00:00Z");
  const T_STALE = new Date("2026-05-22T10:00:00Z"); // before live
  const T_FRESH = new Date("2026-05-22T13:00:00Z"); // after live

  const MANIFEST_WITH_AUTOSAVE: PlumixManifest = {
    ...emptyManifest(),
    entryTypes: [
      {
        name: "post",
        adminSlug: "posts",
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
    // Dismissing keeps the editor (with the autosave content already seeded);
    // the Puck title-value check is dropped — the bespoke shell has no title
    // input, so the chosen-draft content lives only in the canvas iframe.
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

// Ported from "editor revision preview". The PreviewBanner component + testids
// are unchanged. The Puck `plumix-editor-preview-shield` + publish-button
// assertions are dropped — the bespoke read-only mode renders no editing
// toolbar at all (so no publish button to assert), and has no overlay shield.
test.describe("editor revision preview", () => {
  const T_REV0 = new Date("2026-05-22T00:00:00Z");
  const T_REV = new Date("2026-05-22T10:00:00Z");

  const MANIFEST_WITH_REVISIONS: PlumixManifest = {
    ...emptyManifest(),
    entryTypes: [
      {
        name: "post",
        adminSlug: "posts",
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
});

// Ported from "editor collaboration & presence" — DROPPED. The bespoke editor
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
