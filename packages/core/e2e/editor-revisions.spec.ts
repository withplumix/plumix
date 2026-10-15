import type { Page } from "@playwright/test";

import { expect, test } from "@plumix/core/test/playwright";

import type { Entry } from "../src/db/schema/entries.js";
import type { EditorSession } from "./support/session.js";
import { signInAsAdmin } from "./support/session.js";

/** A published article with `count` revisions, the newest titled last. */
async function articleWithRevisions(
  { admin, factories }: EditorSession,
  count: number,
): Promise<{ entry: Entry; revisions: Entry[] }> {
  const entry = await factories.published.create({
    type: "article",
    title: "Live title",
    authorId: admin.id,
  });
  const revisions: Entry[] = [];
  for (let take = 1; take <= count; take++) {
    revisions.push(
      await factories.published.create({
        type: "revision",
        slug: `revision:${String(entry.id)}:take${String(take)}`,
        title: `Take ${String(take)}`,
        authorId: admin.id,
      }),
    );
  }
  return { entry, revisions };
}

async function openRevisions(page: Page): Promise<void> {
  await page.getByTestId("revisions-sheet-trigger").click();
  await expect(page.getByTestId("revisions-sheet-list")).toBeVisible();
}

/** The sheet's revision rows, in the order it lists them. */
const rows = (page: Page) =>
  page
    .getByTestId("revisions-sheet-list")
    .getByTestId(/^revisions-sheet-item-\d+$/);

test.describe("the editor's revisions", () => {
  test("the All and Publishes tabs list the entry's revisions, newest first", async ({
    page,
    editor,
  }) => {
    const session = await signInAsAdmin(page);
    const { entry } = await articleWithRevisions(session, 2);
    await editor.open(entry);

    await openRevisions(page);
    await expect(rows(page)).toHaveText([/Take 2/, /Take 1/]);
    await page.getByTestId("revisions-tab-publishes").click();
    await expect(rows(page)).toHaveText([/Take 2/, /Take 1/]);

    await editor.reload();
    await openRevisions(page);
    await expect(rows(page)).toHaveText([/Take 2/, /Take 1/]);
    await page.getByTestId("revisions-tab-publishes").click();
    await expect(rows(page)).toHaveText([/Take 2/, /Take 1/]);
    const stored = await editor.storedRevisions();
    expect(stored.map((r) => r.title)).toEqual(["Take 2", "Take 1"]);
  });

  test("a comment on a revision persists", async ({ page, editor }) => {
    const session = await signInAsAdmin(page);
    const {
      entry,
      revisions: [revision],
    } = await articleWithRevisions(session, 1);
    const rowId = `revisions-sheet-item-${String(revision?.id)}`;
    await editor.open(entry);
    await openRevisions(page);

    await page.getByTestId(`${rowId}-comment`).click();
    await page.getByTestId(`${rowId}-comment-input`).fill("Fixed the intro");
    await page.getByTestId(`${rowId}-comment-save`).click();
    await expect(page.getByTestId(`${rowId}-comment-display`)).toHaveText(
      "Fixed the intro",
    );

    await editor.reload();
    await openRevisions(page);
    await expect(page.getByTestId(`${rowId}-comment-display`)).toHaveText(
      "Fixed the intro",
    );
    const [stored] = await editor.storedRevisions();
    expect(stored?.message).toBe("Fixed the intro");
  });

  test("the diff view shows a revision beside the current entry", async ({
    page,
    editor,
  }) => {
    const session = await signInAsAdmin(page);
    const {
      entry,
      revisions: [revision],
    } = await articleWithRevisions(session, 1);
    await editor.open(entry);
    const modal = page.getByTestId("revision-diff-modal");
    const diffButton = `revisions-sheet-item-${String(revision?.id)}-diff`;

    await openRevisions(page);
    await page.getByTestId(diffButton).click();
    await expect(
      modal.getByTestId("revision-diff-modal-revision"),
    ).toContainText('"title": "Take 1"');
    await expect(
      modal.getByTestId("revision-diff-modal-current"),
    ).toContainText('"title": "Live title"');

    await editor.reload();
    await openRevisions(page);
    await page.getByTestId(diffButton).click();
    await expect(
      modal.getByTestId("revision-diff-modal-revision"),
    ).toContainText('"title": "Take 1"');
    await expect(
      modal.getByTestId("revision-diff-modal-current"),
    ).toContainText('"title": "Live title"');
    expect((await editor.storedDocument()).title).toBe("Live title");
    const [stored] = await editor.storedRevisions();
    expect(stored?.title).toBe("Take 1");
  });

  test("load more lists the revisions past the first page", async ({
    page,
    editor,
  }) => {
    const session = await signInAsAdmin(page);
    // `entry.revisions.list` answers 25 per page (`revisions.ts`).
    const { entry } = await articleWithRevisions(session, 26);
    await editor.open(entry);
    const loadMore = page.getByTestId("revisions-sheet-load-more");

    await openRevisions(page);
    await expect(rows(page)).toHaveCount(25);
    await expect(rows(page).last()).toContainText("Take 2");
    await loadMore.click();
    await expect(rows(page)).toHaveCount(26);
    await expect(rows(page).last()).toContainText("Take 1");
    await expect(loadMore).toHaveCount(0);

    await editor.reload();
    await openRevisions(page);
    await expect(rows(page)).toHaveCount(25);
    await expect(rows(page).last()).toContainText("Take 2");
    await loadMore.click();
    await expect(rows(page)).toHaveCount(26);
    await expect(rows(page).last()).toContainText("Take 1");
    await expect(loadMore).toHaveCount(0);
    const stored = await editor.storedRevisions();
    expect(stored).toHaveLength(26);
    expect(stored.at(-1)?.title).toBe("Take 1");
  });
});
