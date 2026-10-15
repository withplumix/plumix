import { expect, test } from "@plumix/core/test/playwright";

import type { Entry } from "../src/db/schema/entries.js";
import type { EditorSession } from "./support/session.js";
import { signInAsAdmin } from "./support/session.js";

async function seedArticle({
  admin,
  factories,
}: EditorSession): Promise<Entry> {
  return factories.published.create({
    type: "article",
    title: "Live title",
    authorId: admin.id,
  });
}

async function seedRevision(
  { admin, factories }: EditorSession,
  entry: Entry,
  take: number,
): Promise<Entry> {
  return factories.published.create({
    type: "revision",
    slug: `revision:${String(entry.id)}:take${String(take)}`,
    title: `Take ${String(take)}`,
    authorId: admin.id,
  });
}

/** A published article with `count` revisions, the newest titled last. */
async function articleWithRevisions(
  session: EditorSession,
  count: number,
): Promise<Entry> {
  const entry = await seedArticle(session);
  for (let take = 1; take <= count; take++) {
    await seedRevision(session, entry, take);
  }
  return entry;
}

test.describe("the editor's revisions", () => {
  for (const tab of ["all", "publishes"] as const) {
    test(`the ${tab} tab lists the entry's revisions, newest first`, async ({
      page,
      editor,
    }) => {
      const session = await signInAsAdmin(page);
      const entry = await articleWithRevisions(session, 2);
      await editor.open(entry);
      const { revisions } = editor;

      await revisions.open(tab);
      await expect(revisions.rows).toHaveText([/Take 2/, /Take 1/]);

      await editor.reload();
      await revisions.open(tab);
      await expect(revisions.rows).toHaveText([/Take 2/, /Take 1/]);
      const stored = await editor.storedRevisions();
      expect(stored.map((r) => r.title)).toEqual(["Take 2", "Take 1"]);
    });
  }

  test("a comment on a revision persists", async ({ page, editor }) => {
    const session = await signInAsAdmin(page);
    const entry = await seedArticle(session);
    const { id } = await seedRevision(session, entry, 1);
    await editor.open(entry);
    const { revisions } = editor;
    await revisions.open();

    await revisions.comment(id, "Fixed the intro");
    await expect(revisions.commentOf(id)).toHaveText("Fixed the intro");

    await editor.reload();
    await revisions.open();
    await expect(revisions.commentOf(id)).toHaveText("Fixed the intro");
    const [stored] = await editor.storedRevisions();
    expect(stored?.message).toBe("Fixed the intro");
  });

  test("the diff view shows a revision beside the current entry", async ({
    page,
    editor,
  }) => {
    const session = await signInAsAdmin(page);
    const entry = await seedArticle(session);
    const { id } = await seedRevision(session, entry, 1);
    await editor.open(entry);
    const { revisions } = editor;

    await revisions.open();
    const before = await revisions.diff(id);
    await expect(before.revision).toContainText('"title": "Take 1"');
    await expect(before.current).toContainText('"title": "Live title"');

    await editor.reload();
    await revisions.open();
    const after = await revisions.diff(id);
    await expect(after.revision).toContainText('"title": "Take 1"');
    await expect(after.current).toContainText('"title": "Live title"');
    expect((await editor.storedDocument()).title).toBe("Live title");
    const [stored] = await editor.storedRevisions();
    expect(stored?.title).toBe("Take 1");
  });

  test("load more lists the revisions past the first page", async ({
    page,
    editor,
  }) => {
    const session = await signInAsAdmin(page);
    const entry = await articleWithRevisions(session, 26);
    await editor.open(entry);
    const { revisions } = editor;

    await revisions.open();
    await expect(revisions.rows).toHaveCount(25);
    await expect(revisions.rows.last()).toContainText("Take 2");
    await revisions.loadMore();
    await expect(revisions.rows).toHaveCount(26);
    await expect(revisions.rows.last()).toContainText("Take 1");
    await expect(revisions.loadMoreButton).toHaveCount(0);

    await editor.reload();
    await revisions.open();
    await expect(revisions.rows).toHaveCount(25);
    await expect(revisions.rows.last()).toContainText("Take 2");
    await revisions.loadMore();
    await expect(revisions.rows).toHaveCount(26);
    await expect(revisions.rows.last()).toContainText("Take 1");
    await expect(revisions.loadMoreButton).toHaveCount(0);
    const stored = await editor.storedRevisions();
    expect(stored).toHaveLength(26);
    expect(stored.at(-1)?.title).toBe("Take 1");
  });
});
