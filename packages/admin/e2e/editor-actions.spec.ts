// Editor action coverage: every authoring interaction the canvas
// offers, in one spec — insert (palette / slash / patterns), arrange
// (drag reorder, duplicate, delete), edit (inspector fields, sustained
// typing), pattern authoring (starter modal, refs, copy-as-source),
// and the draft/create surfaces around them.
//
// The mock harness can't prove server persistence, so specs assert the
// two client contracts instead: what the canvas renders, and what
// envelope entry.update receives.
//
// Several tests are test.fail() regression pins for live-verified bugs
// (2026-06-05). They keep the suite green today and flip to
// "unexpectedly passed" when the fix lands — remove the annotation in
// the same PR that fixes the bug.

import { expect, test } from "@playwright/test";

import {
  canvasBlocks,
  canvasOrder,
  dismissStarterModal,
  dragBelow,
  editorEntry,
  installEditorMocks,
  lastUpdate,
  SEEDED_CONTENT,
} from "./support/editor.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_EDITOR_PATTERNS,
  mockManifest,
  rpcErrorBody,
} from "./support/rpc-mock.js";

const SENTENCE = "The quick brown fox jumps over the lazy dog";

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await mockManifest(page, MANIFEST_WITH_EDITOR_PATTERNS);
});

test.describe("editor actions: insert", () => {
  test("palette click inserts a block and autosaves it", async ({ page }) => {
    const updates = await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    await page.getByTestId("plumix-blocks-tab-item-core/quote").click();
    await expect(canvasBlocks(page, "core/quote")).toHaveCount(1);

    await expect.poll(() => updates.length).toBeGreaterThan(0);
    const blocks = lastUpdate(updates)?.content?.blocks ?? [];
    expect(blocks.map((b) => b.name)).toEqual(["core/quote"]);
  });

  // Palette rows are plain click-to-insert buttons today
  // (InsertableEntryRow has no drag source wiring). This pins the gap:
  // when drag-from-palette ships, flip the fixme into a real drag.
  test.fixme("palette item drags onto the canvas drop zone", async ({
    page,
  }) => {
    await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);
    await dragBelow(
      page,
      page.getByTestId("plumix-blocks-tab-item-core/separator"),
      page.getByTestId("dropzone:root:default-zone"),
    );
    await expect(canvasBlocks(page, "core/separator")).toHaveCount(1);
  });
});

test.describe("editor actions: arrange", () => {
  test("dragging a block below its sibling reorders tree and envelope", async ({
    page,
  }) => {
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

  test("duplicate and delete via the block actions panel", async ({ page }) => {
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
});

test.describe("editor actions: edit fields", () => {
  test("heading text edits through the inspector and reaches the canvas", async ({
    page,
  }) => {
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

  test("inspector heading field keeps focus across a typing burst", async ({
    page,
  }) => {
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

  // KNOWN BROKEN: the first keystroke's state update remounts the
  // canvas Tiptap instance and ejects focus to <body>; every keystroke
  // after the remount is dropped (and can land in global hotkey
  // handlers). Verified live and under this mock harness — 0 of 44
  // slow-typed chars persist.
  test("inline rich-text typing on the canvas survives a burst", async ({
    page,
  }) => {
    test.fail();
    const updates = await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page.goto("entries/posts/1/edit");

    const inline = canvasBlocks(page, "core/rich-text")
      .first()
      .locator('[contenteditable="true"]');
    await inline.click();
    await page.keyboard.press("ControlOrMeta+a");
    await inline.pressSequentially(SENTENCE, { delay: 80 });
    await expect(inline.locator("p")).toHaveText(SENTENCE);

    await expect
      .poll(() => {
        const blocks = lastUpdate(updates)?.content?.blocks ?? [];
        return blocks[1]?.attrs?.body;
      })
      .toBe(`<p>${SENTENCE}</p>`);
  });

  // KNOWN BROKEN: same remount loop through the sidebar Body field.
  test("sidebar Body field typing survives a burst", async ({ page }) => {
    test.fail();
    await installEditorMocks(page, {
      entry: editorEntry({ content: SEEDED_CONTENT }),
    });
    await page.goto("entries/posts/1/edit");

    await canvasBlocks(page, "core/rich-text").first().click();
    await expect(page.getByTestId("block-actions-panel")).toBeVisible();
    const body = page
      .getByTestId("plumix-editor-right")
      .locator('[contenteditable="true"]')
      .first();
    await body.click();
    await page.keyboard.press("ControlOrMeta+a");
    await body.pressSequentially(SENTENCE, { delay: 80 });
    await expect(body.locator("p")).toHaveText(SENTENCE);
  });
});

test.describe("editor actions: patterns", () => {
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

  // KNOWN BROKEN: Puck's [data-puck-dnd] draggable wrapper intercepts
  // pointer events over the whole block — even when it's selected — so
  // the Detach / Open source buttons inside PatternRefPreview can never
  // receive a real mouse click. Rich-text escapes through Puck's
  // overlay portal; the ref preview doesn't.
  test("pattern-ref detach button is reachable with the mouse", async ({
    page,
  }) => {
    test.fail();
    await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    await page.getByTestId("plumix-patterns-row-e2e/promo").click();
    const ref = page.getByTestId("plumix-pattern-ref-e2e/promo");
    await ref.click();
    await page
      .getByTestId("plumix-pattern-ref-detach")
      .click({ timeout: 5_000 });
    await expect(ref).toBeHidden();
  });

  // KNOWN BROKEN: even a dispatched DOM click (which sidesteps the
  // hit-testing bug above and verifiably fires on the button) never
  // mutates Puck data — the ref stays put. The pure detachPatternRef
  // helper is unit-covered, so the break sits in the wiring between
  // the overlay-portal render and the usePuck dispatch.
  test("pattern-ref detach converts the ref into an editable copy", async ({
    page,
  }) => {
    test.fail();
    await installEditorMocks(page);
    await page.goto("entries/posts/1/edit");
    await dismissStarterModal(page);

    await page.getByTestId("plumix-patterns-row-e2e/promo").click();
    await expect(
      page.getByTestId("plumix-pattern-ref-e2e/promo"),
    ).toBeVisible();

    await page.getByTestId("plumix-pattern-ref-detach").dispatchEvent("click");
    await expect(page.getByTestId("plumix-pattern-ref-e2e/promo")).toBeHidden({
      timeout: 5_000,
    });
    await expect(
      canvasBlocks(page, "core/heading").first().locator("h3"),
    ).toHaveText("Promo heading");
  });
});

test.describe("editor actions: pattern authoring", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copy as pattern source serializes the canvas to the clipboard", async ({
    page,
  }) => {
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

test.describe("editor actions: draft of a published entry", () => {
  // KNOWN BROKEN: the autosave that creates the pending-draft row never
  // refetches entry.get in-session, so the banner stays hidden and
  // Discard / Publish stay disabled until a full reload — the user gets
  // no signal that their edits diverged from the live row. The mock
  // faithfully serves the WITH-autosave shape on every entry.get after
  // the first update; the client simply never asks again.
  test("editing a published entry surfaces the banner without a reload", async ({
    page,
  }) => {
    test.fail();
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
    let saved = false;
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/entry/update")) {
        saved = true;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: pristine, meta: [] }),
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
  });
});

test.describe("editor actions: create failure", () => {
  // KNOWN BROKEN: create.tsx has no onError — any entry.create failure
  // (e.g. the 409 slug collision two same-millisecond creates produce,
  // since the slug derives from Date.now()) leaves "Creating…" up
  // forever with no feedback and no retry.
  test("a failed create surfaces feedback instead of hanging", async ({
    page,
  }) => {
    test.fail();
    await installEditorMocks(page, {
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/list": [],
      },
    });
    await page.route("**/_plumix/rpc/entry/create", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: rpcErrorBody({
          code: "CONFLICT",
          message: "Resource conflict",
          data: { reason: "slug_taken" },
        }),
      }),
    );

    await page.goto("entries/posts");
    await page.getByTestId("content-list-new-button").click();
    await expect(page.getByTestId("create-entry-pending")).toBeVisible();
    // The pending indicator must resolve into something — an error
    // surface or a navigation — within a generous window.
    await expect(page.getByTestId("create-entry-pending")).toBeHidden({
      timeout: 8_000,
    });
  });
});
