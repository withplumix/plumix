// Entry lifecycle through the real worker: publish, the
// draft-of-published banner with save/discard/publish-draft, the
// revisions sheet, and the silent hang when entry.create fails.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  createPost,
  insertHeroPattern,
  withAutosave,
} from "./support/editor.js";

// Publishing a live draft flips status through entry/update;
// `entry.publish` only serves the draft-of-published header.
async function publishEntry(page: Page) {
  await withAutosave(page, async () => {
    await page.getByTestId("plumix-editor-publish-button").click();
  });
  // Publishing swaps the header to the draft-of-published actions.
  await expect(page.getByTestId("editor-draft-save")).toBeVisible();
}

test.describe("editor lifecycle: publish", () => {
  test("publish flips the entry to published in the list", async ({ page }) => {
    const id = await createPost(page);
    await insertHeroPattern(page);
    // The title must reach the live row before publish snapshots it.
    await withAutosave(page, async () => {
      await page
        .getByTestId("plumix-editor-title-input")
        .fill(`Lifecycle ${String(id)}`);
    });
    await publishEntry(page);

    // The status badge has no testid — anchor on the table row that
    // contains this entry's title link.
    await page.goto("entries/posts");
    const row = page
      .locator("tr")
      .filter({ has: page.getByTestId(`content-list-row-${String(id)}`) });
    // Status renders lowercase ("published") and is capitalized by CSS.
    await expect(row).toContainText(/published/i);
  });

  test("published entry records a revision in the sheet", async ({ page }) => {
    await createPost(page);
    await insertHeroPattern(page);
    await publishEntry(page);

    await page.getByTestId("revisions-sheet-trigger").click();
    await expect(page.getByTestId("revisions-sheet-list")).toBeVisible();
    await expect(
      page.locator("[data-testid^='revisions-sheet-item-']").first(),
    ).toBeVisible();
  });
});

test.describe("editor lifecycle: draft of a published entry", () => {
  // KNOWN BROKEN: the autosave that creates the pending-draft row never
  // refetches `entry.get` in-session, so the banner stays hidden and
  // Discard / Publish stay disabled until a full reload — the user gets
  // no signal that their edits diverged from the live row.
  test("editing a published entry surfaces the banner without a reload", async ({
    page,
  }) => {
    test.fail();
    const id = await createPost(page);
    await insertHeroPattern(page);
    await publishEntry(page);

    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect(page.getByTestId("editor-draft-save")).toBeVisible();
    await withAutosave(page, async () => {
      await page
        .getByTestId("plumix-editor-title-input")
        .fill(`In-session ${String(id)}`);
    });
    await expect(page.getByTestId("unpublished-changes-banner")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("pending draft shows the banner after reload; discard reverts", async ({
    page,
  }) => {
    const id = await createPost(page);
    await insertHeroPattern(page);
    await withAutosave(page, async () => {
      await page
        .getByTestId("plumix-editor-title-input")
        .fill(`Banner ${String(id)}`);
    });
    await publishEntry(page);

    // Re-enter the editor in draft-of-published mode and stage a draft.
    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect(page.getByTestId("editor-draft-save")).toBeVisible();
    await withAutosave(page, async () => {
      await page
        .getByTestId("plumix-editor-title-input")
        .fill(`Banner edited ${String(id)}`);
    });

    // The reload works around the in-session staleness pinned above.
    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect(page.getByTestId("unpublished-changes-banner")).toBeVisible();

    const discarded = page.waitForResponse(
      (r) => r.url().endsWith("/entry/discardDraft") && r.status() === 200,
      { timeout: 15_000 },
    );
    await page.getByTestId("editor-draft-discard").click();
    await discarded;
    await expect(page.getByTestId("unpublished-changes-banner")).toBeHidden();
    await expect(page.getByTestId("plumix-editor-title-input")).toHaveValue(
      `Banner ${String(id)}`,
    );
  });

  test("publish-draft pushes pending changes live", async ({ page }) => {
    const id = await createPost(page);
    await insertHeroPattern(page);
    await publishEntry(page);

    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect(page.getByTestId("editor-draft-save")).toBeVisible();
    await withAutosave(page, async () => {
      await page
        .getByTestId("plumix-editor-title-input")
        .fill(`Draft push ${String(id)}`);
    });

    // The reload works around the in-session staleness pinned above.
    await page.goto(`entries/posts/${String(id)}/edit`);
    await expect(page.getByTestId("unpublished-changes-banner")).toBeVisible();

    const published = page.waitForResponse(
      (r) => r.url().endsWith("/entry/publish") && r.status() === 200,
      { timeout: 15_000 },
    );
    await page.getByTestId("editor-draft-publish").click();
    await published;
    await expect(page.getByTestId("unpublished-changes-banner")).toBeHidden();

    await page.goto("entries/posts");
    const row = page
      .locator("tr")
      .filter({ has: page.getByTestId(`content-list-row-${String(id)}`) });
    await expect(row).toContainText(`Draft push ${String(id)}`);
    await expect(row).toContainText(/published/i);
  });
});

test.describe("editor lifecycle: create failure", () => {
  // KNOWN BROKEN: create.tsx has no onError — any entry.create failure
  // (e.g. the 409 slug collision two same-millisecond creates produce,
  // since the slug derives from Date.now()) leaves "Creating…" up
  // forever with no feedback and no retry.
  test("a failed create surfaces feedback instead of hanging", async ({
    page,
  }) => {
    test.fail();
    await page.route("**/_plumix/rpc/entry/create", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          json: {
            defined: true,
            code: "CONFLICT",
            status: 409,
            message: "Resource conflict",
            data: { reason: "slug_taken" },
          },
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
