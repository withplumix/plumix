// The editor is the heart of the CMS, so its entire e2e surface lives
// in this single file, grouped one `test.describe` per editor feature.
// The mock harness can't prove server persistence, so specs assert the
// two client contracts instead: what the canvas renders, and what
// envelope entry.update/publish receives.
//
// Feature groups (in file order):
//   - Chrome & layout            mobile/desktop chrome, toolbar, back
//   - Accessibility              axe sweeps + the ARIA pins plumix sets
//   - Block insertion            slash menu, palette tiles, palette drag
//   - Slash menu                 input aria-label, keyboard insert, escape
//   - Selection & block actions  select → fields/actions, duplicate,
//                                delete, copy JSON toast
//   - Field editing              inspector text field, heading Level
//                                select, focus across a typing burst
//   - Rich text                  inline + sidebar tiptap typing → canvas
//   - Server-loaded content      plumix.v2 render, word count, nesting
//   - Document tab               slug, excerpt, parent picker, metaboxes
//   - Outline & word count       (covered under server-loaded content)
//   - Preview                    primary opens new tab, menu copies link
//   - Publishing & autosave      pill cycle, envelope, publish, conflicts
//   - Patterns                   section/slash/starter, refs, detach,
//                                copy-as-pattern-source
//   - Draft of a published entry banner, save/publish/discard surfaces
//   - Stale-draft dialog         autosave anchored against older live row
//   - Revision preview           ?revision=N preview banner + shield
//   - Collaboration / presence   co-author indicator polling
//   - Create failure             retry recovers from a 409

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import { emptyManifest } from "@plumix/core/manifest";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  canvasBlocks,
  canvasOrder,
  dismissStarterModal,
  dragBelow,
  dragOnto,
  editorEntry,
  insertViaSlash,
  installEditorMocks,
  lastUpdate,
  publishedEntry,
  publishedEntryRpcBody,
  SEEDED_CONTENT,
  T0,
} from "./support/editor.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_EDITOR_PATTERNS,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
  mockRpcWithCapture,
  rpcConflictBody,
  rpcErrorBody,
  rpcOkBody,
} from "./support/rpc-mock.js";

const SENTENCE = "The quick brown fox jumps over the lazy dog";

test.use({ viewport: { width: 1280, height: 800 } });

// Default install: the post fixture without patterns. The chrome,
// a11y, slash-insert, server-content, document, and publish/autosave
// groups build on this — they never open the starter modal because
// MANIFEST_WITH_POST carries no starter-eligible pattern.
test.beforeEach(async ({ page }) => {
  await mockManifest(page, MANIFEST_WITH_POST);
  await mockRpc(page, {
    "/auth/session": AUTHED_ADMIN,
    "/entry/get": editorEntry(),
    "/entry/list": [],
  });
});

test.describe("editor chrome & layout", () => {
  test("mobile chrome collapses both sidebars into floating sheet triggers", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto("entries/posts/1/edit");

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

  test("canvas toolbar zooms and switches viewport", async ({ page }) => {
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
    await page.goto("entries/posts/1/edit");

    await page.getByTestId("plumix-editor-back-button").click();
    // The list route normalizes search params on entry — match the
    // path, not the full URL.
    await expect(page).toHaveURL(/\/entries\/posts(\?|$)/);
    await expect(page.getByTestId("content-list-new-button")).toBeVisible();
  });
});

// ARIA pins + keyboard walkthrough live here rather than in unit
// tests because the Puck-based editor doesn't mount under jsdom —
// these need a real browser. Generic role/parent-child checks are
// covered by the axe sweeps; the pins below cover only the attributes
// plumix itself sets.
test.describe("editor accessibility", () => {
  test("desktop chrome has no WCAG 2.1 AA violations from axe-core", async ({
    page,
  }) => {
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("mobile inspector sheet has no WCAG 2.1 AA violations when open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto("entries/posts/1/edit");

    await page.getByTestId("plumix-editor-mobile-inspector-trigger").click();
    await expect(page.getByTestId("plumix-editor-tab-block")).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test("sidebar tab triggers carry role=tab + aria-selected reflecting the active tab", async ({
    page,
  }) => {
    await page.goto("entries/posts/1/edit");
    const blocksTab = page.getByTestId("plumix-editor-tab-blocks");
    await expect(blocksTab).toHaveAttribute("role", "tab");
    await expect(blocksTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("plumix-editor-tab-outline")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    await expect(page.getByTestId("plumix-editor-tab-audit")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    // Right sidebar: block inspector active, style tab idle.
    await expect(page.getByTestId("plumix-editor-tab-block")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("plumix-editor-tab-style")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });
});

test.describe("editor block insertion", () => {
  // Each core block proves itself through the semantic element it
  // renders — one parameterized contract instead of per-block specs.
  const SLASH_INSERTS = [
    { slug: "core/rich-text", selector: "p" },
    { slug: "core/details", selector: "details > summary" },
    {
      slug: "core/callout",
      selector: "aside[role='note'][data-variant='info']",
    },
    { slug: "core/button", selector: "button[data-variant='primary']" },
    { slug: "core/table", selector: "table" },
    { slug: "core/spacer", selector: "div[aria-hidden='true']" },
  ] as const;

  for (const { slug, selector } of SLASH_INSERTS) {
    test(`inserting ${slug} via slash menu renders its semantic element`, async ({
      page,
    }) => {
      await page.goto("entries/posts/1/edit");
      await insertViaSlash(page, slug);
      await expect(page.getByTestId("slash-menu-dialog")).toBeHidden();
      await expect(
        page.getByTestId("plumix-editor-canvas").locator(selector),
      ).toHaveCount(1);
    });
  }

  test("palette click inserts a block and autosaves it", async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    const updates = await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    // The Drawer renders a drag-preview twin of each row — scope the
    // click through Puck's item wrapper.
    await page
      .getByTestId("drawer-item:core/quote")
      .getByTestId("plumix-blocks-tab-item-core/quote")
      .click();
    await expect(canvasBlocks(page, "core/quote")).toHaveCount(1);

    await expect.poll(() => updates.length).toBeGreaterThan(0);
    const blocks = lastUpdate(updates)?.content?.blocks ?? [];
    expect(blocks.map((b) => b.name)).toEqual(["core/quote"]);
  });

  test("palette item drags onto the canvas drop zone", async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    const updates = await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    // Puck's Drawer renders a hidden drag-preview twin of each row, so
    // the row testid resolves twice — drag from Puck's item wrapper.
    await dragOnto(
      page,
      page.getByTestId("drawer-item:core/separator"),
      page.getByTestId("plumix-editor-canvas-frame"),
    );
    await expect(canvasBlocks(page, "core/separator")).toHaveCount(1);

    await expect
      .poll(() =>
        (lastUpdate(updates)?.content?.blocks ?? []).map((b) => b.name),
      )
      .toEqual(["core/separator"]);
  });
});

test.describe("editor slash menu", () => {
  test("slash menu input carries the aria-label that screen readers announce", async ({
    page,
  }) => {
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-editor-canvas").focus();
    await page.keyboard.press("/");
    await expect(page.getByTestId("slash-menu-input")).toHaveAttribute(
      "aria-label",
      "Search blocks and patterns",
    );
  });

  test("/, type, Enter inserts a block via keyboard alone", async ({
    page,
  }) => {
    await page.goto("entries/posts/1/edit");

    const canvas = page.getByTestId("plumix-editor-canvas");
    await canvas.focus();
    await page.keyboard.press("/");
    await page.keyboard.type("paragraph");
    // Confirm the filter narrowed to the expected item before Enter —
    // a future block adding "paragraph" to its keywords could otherwise
    // silently change which spec gets inserted while this still passes.
    await expect(
      page.getByTestId("slash-menu-item-core/rich-text"),
    ).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(canvas.locator("p")).toHaveCount(1);
  });

  test("Escape closes the slash menu without inserting", async ({ page }) => {
    await page.goto("entries/posts/1/edit");

    await page.getByTestId("plumix-editor-canvas").focus();
    await page.keyboard.press("/");
    await expect(page.getByTestId("slash-menu-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("slash-menu-dialog")).toBeHidden();
  });
});

test.describe("editor selection & block actions", () => {
  test("selecting a block opens its actions panel and inspector fields", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page.goto("entries/posts/1/edit");

    // Nothing selected: the panel shows its empty hint, not the actions.
    await expect(page.getByTestId("block-actions-empty")).toBeVisible();

    await canvasBlocks(page, "core/heading").first().click();
    await expect(page.getByTestId("block-actions-panel")).toBeVisible();
    await expect(page.getByTestId("block-action-duplicate")).toBeVisible();
    await expect(page.getByTestId("block-action-delete")).toBeVisible();
    await expect(page.getByTestId("block-action-copy-json")).toBeVisible();
    // Selecting surfaces the block's inspector fields — the heading's
    // Text input is the first input of the right column.
    await expect(
      page.getByTestId("plumix-editor-right").locator("input").first(),
    ).toBeVisible();
  });

  test("duplicate and delete via the block actions panel", async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    const updates = await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page.goto("entries/posts/1/edit");

    await canvasBlocks(page, "core/heading").first().click();
    await expect(page.getByTestId("block-actions-panel")).toBeVisible();

    await page.getByTestId("block-action-duplicate").click();
    await expect(canvasBlocks(page, "core/heading")).toHaveCount(2);

    await canvasBlocks(page, "core/heading").first().click();
    await page.getByTestId("block-action-delete").click();
    await expect(canvasBlocks(page, "core/heading")).toHaveCount(1);

    // Poll the final envelope shape, not the capture count — if the two
    // clicks straddle the 1 s autosave debounce, an intermediate
    // [heading, heading, rich-text] save lands first and a count-based
    // poll would read it.
    await expect
      .poll(() =>
        (lastUpdate(updates)?.content?.blocks ?? []).map((b) => b.name),
      )
      .toEqual(["core/heading", "core/rich-text"]);
  });

  test("dragging a block below its sibling reorders tree and envelope", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    const updates = await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page.goto("entries/posts/1/edit");

    const heading = canvasBlocks(page, "core/heading").first();
    const richText = canvasBlocks(page, "core/rich-text").first();
    await expect(richText).toBeVisible();

    await dragBelow(page, heading, richText);
    await expect
      .poll(() => canvasOrder(page))
      .toEqual(["rich-text", "heading"]);

    // The reorder must reach the autosave envelope, not just the DOM.
    await expect.poll(() => updates.length).toBeGreaterThan(0);
    const blocks = lastUpdate(updates)?.content?.blocks ?? [];
    expect(blocks.map((b) => b.name)).toEqual([
      "core/rich-text",
      "core/heading",
    ]);
  });

  test("Copy JSON copies the selected block and shows a success toast", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("entries/posts/1/edit");

    await canvasBlocks(page, "core/heading").first().click();
    await expect(page.getByTestId("block-actions-panel")).toBeVisible();

    await page.getByTestId("block-action-copy-json").click();
    await expect(page.getByTestId("toast-success")).toBeVisible();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('"type": "core/heading"');
  });
});

test.describe("editor field editing", () => {
  test("heading text edits through the inspector and reaches the canvas", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    const updates = await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page.goto("entries/posts/1/edit");

    await canvasBlocks(page, "core/heading").first().click();
    await expect(page.getByTestId("block-actions-panel")).toBeVisible();
    // Puck renders the field without a testid — first text input of the
    // inspector column is the heading's Text field.
    const textField = page
      .getByTestId("plumix-editor-right")
      .locator("input")
      .first();
    await textField.fill("Inspector heading");
    await expect(
      canvasBlocks(page, "core/heading").first().locator("h2"),
    ).toHaveText("Inspector heading");

    await expect
      .poll(() => {
        const blocks = lastUpdate(updates)?.content?.blocks ?? [];
        return blocks[0]?.attrs?.text;
      })
      .toBe("Inspector heading");
  });

  test("the heading Level select retags the canvas element and rides the envelope", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    const updates = await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page.goto("entries/posts/1/edit");

    const block = canvasBlocks(page, "core/heading").first();
    await block.click();
    await expect(page.getByTestId("block-actions-panel")).toBeVisible();
    // Seeded heading is level 2 — an <h2>.
    await expect(block.locator("h2")).toBeVisible();

    // The Level field is the only native <select> in the inspector
    // column. Puck renders it without a testid, so scope through the
    // right-column wrapper (this is OUR field, not a Puck internal).
    const levelSelect = page
      .getByTestId("plumix-editor-right")
      .locator("select")
      .first();
    await levelSelect.selectOption({ label: "H3" });

    await expect(block.locator("h3")).toBeVisible();
    await expect(block.locator("h2")).toHaveCount(0);

    await expect
      .poll(() => {
        const blocks = lastUpdate(updates)?.content?.blocks ?? [];
        return blocks[0]?.attrs?.level;
      })
      .toBe(3);
  });

  test("inspector heading field keeps focus across a typing burst", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page.goto("entries/posts/1/edit");

    await canvasBlocks(page, "core/heading").first().click();
    const textField = page
      .getByTestId("plumix-editor-right")
      .locator("input")
      .first();
    await textField.click();
    await textField.clear();
    await textField.pressSequentially(SENTENCE, { delay: 50 });
    await expect(textField).toHaveValue(SENTENCE);
    // The full value alone could survive a focus bounce (the locator
    // re-targets per key) — pin that focus actually stayed put.
    await expect(textField).toBeFocused();
  });
});

test.describe("editor rich text", () => {
  test("inline rich-text typing on the canvas survives a burst", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    const updates = await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page.goto("entries/posts/1/edit");

    // `.tiptap` skips Puck's Suspense fallback — a transient
    // contenteditable that the real editor replaces ~300 ms after the
    // field mounts, destroying whatever just got focus.
    const inline = canvasBlocks(page, "core/rich-text")
      .first()
      .locator('.tiptap[contenteditable="true"]');
    // Select-then-edit, Puck's intended canvas UX: the first click
    // selects the block (the overlay swallows it), the second enters
    // the Tiptap editor. The pause keeps the second click outside the
    // browser's ~500 ms dblclick window — a coalesced dblclick never
    // enters edit mode. keyboard.type (not pressSequentially) because
    // the latter re-focuses the element per burst, resetting the
    // Ctrl+A selection.
    await inline.click();
    await expect(page.getByTestId("block-actions-panel")).toBeVisible();
    await page.waitForTimeout(600);
    await inline.click();
    await expect(inline).toBeFocused();
    await page.waitForTimeout(300);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(SENTENCE, { delay: 80 });
    await expect(inline.locator("p")).toHaveText(SENTENCE);

    await expect
      .poll(() => {
        const blocks = lastUpdate(updates)?.content?.blocks ?? [];
        return blocks[1]?.attrs?.body;
      })
      .toBe(`<p>${SENTENCE}</p>`);
  });

  test("sidebar Body field typing survives a burst", async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page.goto("entries/posts/1/edit");

    await canvasBlocks(page, "core/rich-text").first().click();
    await expect(page.getByTestId("block-actions-panel")).toBeVisible();
    // `.tiptap` skips the Suspense fallback — see the inline test.
    const body = page
      .getByTestId("plumix-editor-right")
      .locator('.tiptap[contenteditable="true"]')
      .first();
    await body.click();
    await expect(body).toBeFocused();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(SENTENCE, { delay: 80 });
    await expect(body.locator("p")).toHaveText(SENTENCE);
  });
});

test.describe("editor server-loaded content", () => {
  test("plumix.v2 content renders in the canvas on initial mount", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": {
        ...editorEntry(),
        content: {
          version: "plumix.v2",
          blocks: [
            {
              id: "h1",
              name: "core/heading",
              attrs: { level: 2, text: "Hello from server" },
            },
          ],
        },
      },
    });

    await page.goto("entries/posts/1/edit");

    const canvas = page.getByTestId("plumix-editor-canvas");
    await expect(canvas.locator("h2")).toHaveText("Hello from server");
  });

  test("word count reflects server-loaded prose and updates as the title is unrelated", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": {
        ...editorEntry(),
        content: {
          version: "plumix.v2",
          blocks: [
            {
              id: "h1",
              name: "core/heading",
              attrs: { level: 2, text: "Big Title" },
            },
            {
              id: "r1",
              name: "core/rich-text",
              attrs: { body: "<p>one two three</p>" },
            },
          ],
        },
      },
    });

    await page.goto("entries/posts/1/edit");

    const count = page.getByTestId("plumix-editor-word-count");
    // "Big Title" (2) + "one two three" (3) = 5 words; characters summed
    // per block (9 + 13 = 22), no phantom inter-block separator.
    await expect(count).toHaveAttribute("data-words", "5");
    await expect(count).toHaveAttribute("data-characters", "22");
  });

  test("wrapper block renders its nested children in the canvas", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": {
        ...editorEntry(),
        content: {
          version: "plumix.v2",
          blocks: [
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
      },
    });

    await page.goto("entries/posts/1/edit");

    const canvas = page.getByTestId("plumix-editor-canvas");
    await expect(canvas.locator("h3")).toHaveText("Inside group");
  });
});

test.describe("editor document tab", () => {
  test("excerpt edits ride the autosave envelope", async ({ page }) => {
    // Excerpt is gated on the type's supports list — the beforeEach
    // MANIFEST_WITH_POST has none, so override with one that does.
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
      },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-editor-tab-document").click();

    await page.getByTestId("entry-excerpt-input").fill("Hand-written summary");

    await expect
      .poll(
        () =>
          (captures.at(-1) as { excerpt?: string } | undefined)?.excerpt ??
          null,
      )
      .toBe("Hand-written summary");
    // Excerpt rides the normal autosave routing (the autosave-row
    // patch honors it) — no forced live write.
    expect(captures.at(-1)).not.toHaveProperty("saveAs");
  });

  test("excerpt input is absent when the type lacks excerpt support", async ({
    page,
  }) => {
    // The beforeEach defaults already model this: MANIFEST_WITH_POST
    // declares no supports list.
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-editor-tab-document").click();
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
      },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-editor-tab-document").click();
    await page.getByTestId("entry-excerpt-input").clear();

    await expect
      .poll(() =>
        captures.some(
          (input) => (input as { excerpt?: unknown }).excerpt === null,
        ),
      )
      .toBe(true);
  });

  test("Document tab exposes the slug; editing it ships a live entry.update", async ({
    page,
  }) => {
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...editorEntry(), slug: "custom-slug", updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry(),
        "/entry/list": [],
      },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-editor-tab-document").click();

    const slug = page.getByTestId("entry-slug-input");
    await expect(slug).toHaveValue("entry-1");
    await slug.fill("custom-slug");

    await expect
      .poll(
        () => (captures.at(-1) as { slug?: string } | undefined)?.slug ?? null,
      )
      .toBe("custom-slug");
    // Structural fields must write the live row — the autosave-row
    // patch silently drops slug/parentId.
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
      },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-editor-tab-document").click();

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
    // beforeEach defaults: MANIFEST_WITH_POST is non-hierarchical.
    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-editor-tab-document").click();
    await expect(page.getByTestId("entry-slug-input")).toBeVisible();
    await expect(page.getByTestId("entry-parent-select")).toHaveCount(0);
  });

  test("entry metaboxes render in the Document tab and ride the autosave meta bag", async ({
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
      },
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-editor-tab-document").click();

    await expect(page.getByTestId("entry-meta-box-seo")).toBeVisible();
    await page.getByTestId("meta-box-field-meta_title-input").fill("SEO title");

    await expect
      .poll(
        () =>
          (captures.at(-1) as { meta?: Record<string, unknown> } | undefined)
            ?.meta?.meta_title ?? null,
      )
      .toBe("SEO title");
    // Meta rides the normal autosave routing — the autosave-row patch
    // merges it over the live row's bag.
    expect(captures.at(-1)).not.toHaveProperty("saveAs");
  });
});

test.describe("editor preview", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("primary Preview button opens the minted link in a new tab", async ({
    page,
    context,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    await installEditorMocks(page, {
      handlers: {
        "/entry/createPreviewLink": {
          token: "tok123",
          url: "/post/hello?preview=tok123",
        },
      },
    });
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    // The primary button opens a blank tab synchronously, then
    // navigates it once the signed URL resolves.
    const popupPromise = context.waitForEvent("page");
    await page.getByTestId("editor-preview").click();
    const popup = await popupPromise;
    // The tab opens at about:blank inside the click gesture, then
    // navigates once the signed URL resolves — wait for that hop.
    await expect
      .poll(() => popup.url(), { timeout: 10_000 })
      .toContain("/post/hello?preview=tok123");
  });

  test("menu copies the absolute preview url to the clipboard with a toast", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
    await installEditorMocks(page, {
      handlers: {
        "/entry/createPreviewLink": {
          token: "tok123",
          url: "/post/hello?preview=tok123",
        },
      },
    });
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    // The copy-link affordance now lives inside the split control's
    // dropdown — open it first, then click the item.
    await page.getByTestId("editor-preview-menu").click();
    await page.getByTestId("editor-copy-preview-link").click();
    await expect(page.getByTestId("toast-success")).toBeVisible();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("/post/hello?preview=tok123");
    expect(clipboard).toMatch(/^https?:\/\//);
  });
});

test.describe("editor publishing & autosave", () => {
  test("autosave pill cycles saved → saving → saved when a block is inserted", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/entry/update", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ ...editorEntry(), updatedAt: T0 }),
      }),
    );
    await page.goto("entries/posts/1/edit");

    const pill = page.getByTestId("plumix-autosave-pill");
    await expect(pill).toHaveAttribute("data-status", "saved");

    await insertViaSlash(page, "core/rich-text");

    await expect(pill).toHaveAttribute("data-status", "saving");
    await expect(pill).toHaveAttribute("data-status", "saved");
  });

  test("autosave POSTs a plumix.v2 envelope to entry.update after a block is inserted", async ({
    page,
  }) => {
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...editorEntry(), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry(),
      },
    });
    await page.goto("entries/posts/1/edit");

    await insertViaSlash(page, "core/rich-text");

    await expect
      .poll(
        () =>
          (captures.at(-1) as { content?: { version?: string } } | undefined)
            ?.content?.version ?? null,
      )
      .toBe("plumix.v2");
    const lastInput = captures.at(-1) as {
      readonly id: number;
      readonly content: { readonly blocks: unknown[] };
      readonly expectedLiveUpdatedAt: string;
    };
    expect(lastInput.id).toBe(1);
    expect(lastInput.content.blocks.length).toBeGreaterThan(0);
    expect(lastInput.expectedLiveUpdatedAt).toBe(T0.toISOString());
  });

  test("editing the title fires entry.update with the new title", async ({
    page,
  }) => {
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...editorEntry(), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": editorEntry(),
      },
    });

    await page.goto("entries/posts/1/edit");

    const titleInput = page.getByTestId("plumix-editor-title-input");
    await expect(titleInput).toBeVisible();
    await titleInput.fill("My new title");

    await expect
      .poll(() => captures.length, { timeout: 5000 })
      .toBeGreaterThan(0);

    const last = captures.at(-1) as { title?: string } | undefined;
    expect(last?.title).toBe("My new title");
  });

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
      },
    });
    await page.goto("entries/posts/1/edit");

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
    });
    await page.goto("entries/posts/1/edit");

    await expect(
      page.getByTestId("plumix-editor-publish-button"),
    ).toBeDisabled();
  });

  test("publishing refetches entry.get so the button reflects the new status", async ({
    page,
  }) => {
    let entryGetCalls = 0;
    await page.route("**/_plumix/rpc/entry/get", (route) => {
      entryGetCalls += 1;
      const status = entryGetCalls === 1 ? "draft" : "published";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({
          ...editorEntry(),
          status,
          publishedAt: status === "published" ? T0 : null,
        }),
      });
    });
    await page.route("**/_plumix/rpc/entry/update", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({
          ...editorEntry(),
          status: "published",
          publishedAt: T0,
        }),
      }),
    );

    await page.goto("entries/posts/1/edit");

    const button = page.getByTestId("plumix-editor-publish-button");
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(() => entryGetCalls).toBeGreaterThan(1);
    await expect(button).toBeDisabled();
  });

  test("autosave CONFLICT recovers: the next save sends the refreshed token", async ({
    page,
  }) => {
    let entryGetCalls = 0;
    let entryUpdateCalls = 0;
    const T1 = new Date("2026-06-01T00:00:00Z");
    const updateInputs: unknown[] = [];
    await page.route("**/_plumix/rpc/entry/get", (route) => {
      entryGetCalls += 1;
      const updatedAt = entryGetCalls === 1 ? T0 : T1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ ...editorEntry(), updatedAt }),
      });
    });
    await page.route("**/_plumix/rpc/entry/update", (route) => {
      entryUpdateCalls += 1;
      const body = route.request().postDataJSON() as { json?: unknown };
      updateInputs.push(body.json);
      if (entryUpdateCalls === 1) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: rpcConflictBody("stale_expected_updated_at"),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody({ ...editorEntry(), updatedAt: T1 }),
      });
    });
    await page.goto("entries/posts/1/edit");

    const pill = page.getByTestId("plumix-autosave-pill");

    await insertViaSlash(page, "core/rich-text");

    await expect(pill).toHaveAttribute("data-status", "error");
    await expect.poll(() => entryGetCalls).toBe(2);

    await insertViaSlash(page, "core/rich-text");

    await expect(pill).toHaveAttribute("data-status", "saved");
    expect(
      (updateInputs.at(-1) as { expectedLiveUpdatedAt: string })
        .expectedLiveUpdatedAt,
    ).toBe(T1.toISOString());
  });

  test("autosave pill flips to error when entry.update rejects", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/entry/update", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: rpcErrorBody({
          code: "INTERNAL_SERVER_ERROR",
          message: "boom",
        }),
      }),
    );
    await page.goto("entries/posts/1/edit");

    const pill = page.getByTestId("plumix-autosave-pill");
    await expect(pill).toHaveAttribute("data-status", "saved");

    await insertViaSlash(page, "core/rich-text");

    await expect(pill).toHaveAttribute("data-status", "error");
  });
});

test.describe("editor patterns", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
  });

  test("patterns section click splices the pattern body", async ({ page }) => {
    const updates = await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    await page.getByTestId("plumix-patterns-row-e2e/hero").click();
    await expect(
      canvasBlocks(page, "core/heading").first().locator("h2"),
    ).toHaveText("Pattern heading");
    await expect(
      canvasBlocks(page, "core/rich-text").first().locator("p"),
    ).toHaveText("Pattern body copy");

    await expect.poll(() => updates.length).toBeGreaterThan(0);
    const blocks = lastUpdate(updates)?.content?.blocks ?? [];
    expect(blocks.map((b) => b.name)).toEqual([
      "core/heading",
      "core/rich-text",
    ]);
  });

  test("slash menu surfaces the pattern as a card and inserts it", async ({
    page,
  }) => {
    await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    await page.getByTestId("plumix-editor-canvas").focus();
    await page.keyboard.press("/");
    await expect(page.getByTestId("slash-menu-dialog")).toBeVisible();
    await page.keyboard.type("hero");
    const card = page.getByTestId("slash-menu-pattern-card-e2e/hero");
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByTestId("slash-menu-dialog")).toBeHidden();
    await expect(canvasBlocks(page, "core/heading")).toHaveCount(1);
    await expect(canvasBlocks(page, "core/rich-text")).toHaveCount(1);
  });

  test("fresh empty entry offers starter patterns; picking one seeds the canvas", async ({
    page,
  }) => {
    await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");

    const modal = page.getByTestId("plumix-starter-modal");
    await expect(modal).toBeVisible();
    await page.getByTestId("plumix-starter-modal-card-e2e/hero").click();
    await expect(modal).toBeHidden();
    await expect(
      canvasBlocks(page, "core/heading").first().locator("h2"),
    ).toHaveText("Pattern heading");
  });

  test("start blank leaves the canvas empty", async ({ page }) => {
    await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");

    await dismissStarterModal(page);
    await expect(
      page.getByTestId("plumix-editor-canvas").locator("[data-puck-component]"),
    ).toHaveCount(0);
  });

  test("reference pattern inserts a ref node, not an expanded copy", async ({
    page,
  }) => {
    const updates = await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    await page.getByTestId("plumix-patterns-row-e2e/promo").click();
    await expect(
      page.getByTestId("plumix-pattern-ref-e2e/promo"),
    ).toBeVisible();

    await expect.poll(() => updates.length).toBeGreaterThan(0);
    const blocks = lastUpdate(updates)?.content?.blocks ?? [];
    expect(blocks.map((b) => b.name)).toEqual(["core/pattern-ref"]);
    expect(blocks[0]?.attrs?.slug).toBe("e2e/promo");
  });

  test("pattern-ref detach converts the ref into an editable copy", async ({
    page,
  }) => {
    await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    await page.getByTestId("plumix-patterns-row-e2e/promo").click();
    const ref = page.getByTestId("plumix-pattern-ref-e2e/promo");
    await ref.click();
    // Real mouse click — the detach button being unreachable under the
    // selection overlay was a live-verified bug; dispatchEvent would
    // mask a regression.
    await page
      .getByTestId("plumix-pattern-ref-detach")
      .click({ timeout: 5_000 });
    await expect(ref).toBeHidden();
    await expect(
      canvasBlocks(page, "core/heading").first().locator("h3"),
    ).toHaveText("Promo heading");
  });

  test("copy as pattern source serializes the canvas to the clipboard", async ({
    page,
  }) => {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page.goto("entries/posts/1/edit");

    await page.getByTestId("plumix-editor-copy-as-pattern-source").click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("definePattern({");
    expect(clipboard).toContain('block("core/heading"');
    expect(clipboard).toContain('text: "Seeded heading"');
    expect(clipboard).toContain('block("core/rich-text"');
  });
});

test.describe("editor draft of a published entry", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
  });

  // Static initial-state mocks: the server reports a published entry
  // with or without a pending autosave row via `_preview`. An autosave
  // timestamp equal to the live row's is pending but not stale, so the
  // banner renders without the stale-draft dialog in the way.
  async function mockPublishedEntry(
    page: Page,
    opts: { autosaveUpdatedAt: Date | null },
  ): Promise<void> {
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/activity/list": { users: [] },
    });
    await page.route("**/_plumix/rpc/entry/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: publishedEntryRpcBody(
          publishedEntry({
            content: SEEDED_CONTENT,
            autosaveUpdatedAt: opts.autosaveUpdatedAt,
          }),
        ),
      }),
    );
  }

  test("published entry without an autosave: three-button header, no banner, Publish + Discard disabled", async ({
    page,
  }) => {
    await mockPublishedEntry(page, { autosaveUpdatedAt: null });

    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("editor-draft-save")).toBeVisible();
    await expect(page.getByTestId("editor-draft-publish")).toBeDisabled();
    await expect(page.getByTestId("editor-draft-discard")).toBeDisabled();
    await expect(page.getByTestId("unpublished-changes-banner")).toHaveCount(0);
    // Legacy single Publish button is gone in draft mode.
    await expect(page.getByTestId("plumix-editor-publish-button")).toHaveCount(
      0,
    );
  });

  test("published entry WITH an autosave: banner visible, all three buttons enabled", async ({
    page,
  }) => {
    await mockPublishedEntry(page, { autosaveUpdatedAt: T0 });

    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("unpublished-changes-banner")).toBeVisible();
    await expect(page.getByTestId("editor-draft-save")).toBeEnabled();
    await expect(page.getByTestId("editor-draft-publish")).toBeEnabled();
    await expect(page.getByTestId("editor-draft-discard")).toBeEnabled();
  });

  test("editing a published entry surfaces the banner without a reload", async ({
    page,
  }) => {
    const pristine = editorEntry({
      status: "published",
      content: SEEDED_CONTENT,
    });
    const withAutosave = {
      ...pristine,
      _preview: {
        source: "autosave",
        autosaveUpdatedAt: null,
        liveUpdatedAt: null,
      },
    };
    // Server contract: an autosave-routed save responds with the
    // per-user autosave row, whose `type` is the reserved "autosave".
    const autosaveRow = { ...pristine, type: "autosave" };
    let saved = false;
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/entry/update")) {
        saved = true;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: autosaveRow, meta: [] }),
        });
      }
      const map: Record<string, unknown> = {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": saved ? withAutosave : pristine,
        "/entry/activity/list": { users: [] },
      };
      for (const [suffix, body] of Object.entries(map)) {
        if (url.endsWith(suffix)) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ json: body, meta: [] }),
          });
        }
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("editor-draft-save")).toBeVisible();

    await page.getByTestId("plumix-editor-title-input").fill("Edited live");
    await expect.poll(() => saved, { timeout: 10_000 }).toBe(true);
    await expect(page.getByTestId("unpublished-changes-banner")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("editor-draft-discard")).toBeEnabled();
    await expect(page.getByTestId("editor-draft-publish")).toBeEnabled();
  });

  test("in-session discard restores the live title and canvas", async ({
    page,
  }) => {
    const pristine = editorEntry({
      status: "published",
      content: SEEDED_CONTENT,
      title: "Live title",
    });
    const autosaveRow = { ...pristine, type: "autosave" };
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/entry/update")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: autosaveRow, meta: [] }),
        });
      }
      if (url.endsWith("/entry/discardDraft")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: { discarded: true }, meta: [] }),
        });
      }
      const map: Record<string, unknown> = {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": pristine,
        "/entry/activity/list": { users: [] },
      };
      for (const [suffix, body] of Object.entries(map)) {
        if (url.endsWith(suffix)) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ json: body, meta: [] }),
          });
        }
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("editor-draft-save")).toBeVisible();
    await page.getByTestId("plumix-editor-title-input").fill("Edited title");
    await expect(page.getByTestId("editor-draft-discard")).toBeEnabled();

    await page.getByTestId("editor-draft-discard").click();
    await expect(page.getByTestId("unpublished-changes-banner")).toBeHidden();
    await expect(page.getByTestId("plumix-editor-title-input")).toHaveValue(
      "Live title",
      { timeout: 5_000 },
    );
    await expect(page.getByTestId("toast-success")).toBeVisible();
  });

  test("draft publish: a 409 surfaces an error toast, the retry a success toast", async ({
    page,
  }) => {
    const pristine = editorEntry({
      status: "published",
      content: SEEDED_CONTENT,
      title: "Live title",
    });
    const autosaveRow = { ...pristine, type: "autosave" };
    let publishAttempts = 0;
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/entry/update")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: autosaveRow, meta: [] }),
        });
      }
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
      const map: Record<string, unknown> = {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": pristine,
        "/entry/activity/list": { users: [] },
      };
      for (const [suffix, body] of Object.entries(map)) {
        if (url.endsWith(suffix)) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ json: body, meta: [] }),
          });
        }
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/1/edit");
    await page.getByTestId("plumix-editor-title-input").fill("Edited title");
    await expect(page.getByTestId("editor-draft-publish")).toBeEnabled();

    await page.getByTestId("editor-draft-publish").click();
    await expect(page.getByTestId("toast-error")).toBeVisible();

    await page.getByTestId("editor-draft-publish").click();
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
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
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

  test("Use mine dismisses the dialog and lets the editor proceed with the autosave content", async ({
    page,
  }) => {
    await installAutosaveMocks(page, { autosaveUpdatedAt: T_STALE });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("stale-draft-dialog")).toBeVisible();
    await page.getByTestId("stale-draft-use-mine").click();
    await expect(page.getByTestId("stale-draft-dialog")).toHaveCount(0);
    // Title input still shows the autosave value the route was seeded
    // with — user explicitly chose to keep their draft.
    await expect(page.getByTestId("plumix-editor-title-input")).toHaveValue(
      "Pending edit",
    );
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
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
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

  test("?revision=N renders the preview banner and hides the publish button", async ({
    page,
  }) => {
    await installPreviewMocks(page);
    await page.goto("entries/posts/1/edit?revision=42");
    const banner = page.getByTestId("revision-preview-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Ada Lovelace");
    await expect(page.getByTestId("plumix-editor-publish-button")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("plumix-editor-preview-shield"),
    ).toBeVisible();
  });

  test("Back to live clears the search param", async ({ page }) => {
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

test.describe("editor collaboration & presence", () => {
  const T_LIVE = new Date("2026-05-22T12:00:00Z");
  const T_30S_AGO = new Date("2026-05-22T11:59:30Z");

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

  async function installActivityMocks(
    page: Page,
    opts: {
      coAuthors: readonly {
        id: number;
        name: string | null;
        email: string;
        lastSeenAt: Date;
      }[];
    },
  ): Promise<void> {
    await mockManifest(page, MANIFEST_WITH_AUTOSAVE);
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/entry/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: publishedEntryRpcBody(
          publishedEntry({ autosaveUpdatedAt: null, liveUpdatedAt: T_LIVE }),
        ),
      }),
    );
    await page.route("**/_plumix/rpc/entry/activity/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: { users: opts.coAuthors },
          meta: opts.coAuthors.map((_, i) => [1, "users", i, "lastSeenAt"]),
        }),
      }),
    );
  }

  test("renders the indicator when activity.list returns co-authors", async ({
    page,
  }) => {
    await installActivityMocks(page, {
      coAuthors: [
        {
          id: 7,
          name: "Ada Lovelace",
          email: "ada@example.test",
          lastSeenAt: T_30S_AGO,
        },
      ],
    });
    await page.goto("entries/posts/1/edit");
    const indicator = page.getByTestId("coauthor-indicator");
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText("Ada Lovelace");
  });

  test("no indicator when activity.list returns an empty user list", async ({
    page,
  }) => {
    await installActivityMocks(page, { coAuthors: [] });
    await page.goto("entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("coauthor-indicator")).toHaveCount(0);
  });
});

test.describe("editor create failure", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
  });

  test("a failed create surfaces an error and retry recovers", async ({
    page,
  }) => {
    await installEditorMocks(page, {
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/list": [],
      },
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
    await dismissStarterModal(page);
    await expect(page.getByTestId("plumix-editor-canvas")).toBeVisible();
  });
});
