// Core editor suite: chrome + canvas controls, slash-menu inserts,
// server-loaded content rendering, accessibility, and the
// autosave/publish envelope contracts. Authoring interactions
// (palette, drag, fields, patterns) live in editor-actions.spec.ts;
// drafts/revisions/concurrency in editor-collab.spec.ts.

import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import { editorEntry, insertViaSlash, T0 } from "./support/editor.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
  mockRpcWithCapture,
  rpcConflictBody,
  rpcErrorBody,
  rpcOkBody,
} from "./support/rpc-mock.js";

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await mockManifest(page, MANIFEST_WITH_POST);
  await mockRpc(page, {
    "/auth/session": AUTHED_ADMIN,
    "/entry/get": editorEntry(),
    "/entry/list": [],
  });
});

test.describe("editor chrome", () => {
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
// covered by the axe sweeps above; the pins below cover only the
// attributes plumix itself sets.
test.describe("editor accessibility", () => {
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

test.describe("editor slash-menu inserts", () => {
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
    test(`inserting ${slug} renders its semantic element`, async ({ page }) => {
      await page.goto("entries/posts/1/edit");
      await insertViaSlash(page, slug);
      await expect(page.getByTestId("slash-menu-dialog")).toBeHidden();
      await expect(
        page.getByTestId("plumix-editor-canvas").locator(selector),
      ).toHaveCount(1);
    });
  }
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

test.describe("editor autosave and publish", () => {
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
