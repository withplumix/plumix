// Editor action coverage: every authoring interaction the canvas
// offers, in one spec — insert (palette / slash / patterns), arrange
// (drag reorder, duplicate, delete), edit (inspector fields, sustained
// typing), pattern authoring (starter modal, refs, copy-as-source),
// and the draft/create surfaces around them.
//
// The mock harness can't prove server persistence, so specs assert the
// two client contracts instead: what the canvas renders, and what
// envelope entry.update receives.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  canvasBlocks,
  canvasOrder,
  dismissStarterModal,
  dragBelow,
  dragOnto,
  editorEntry,
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
  mockManifest,
  mockRpc,
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

  test("inline rich-text typing on the canvas survives a burst", async ({
    page,
  }) => {
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

  test("copy preview link writes the absolute preview url to the clipboard", async ({
    page,
  }) => {
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

    await page.getByTestId("editor-copy-preview-link").click();
    await expect(page.getByTestId("toast-success")).toBeVisible();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("/post/hello?preview=tok123");
    expect(clipboard).toMatch(/^https?:\/\//);
  });
});

test.describe("editor actions: draft of a published entry", () => {
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

test.describe("editor actions: create failure", () => {
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
