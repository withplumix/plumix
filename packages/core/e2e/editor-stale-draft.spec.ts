import { expect, test } from "@plumix/core/test/playwright";

import type { BlockNode } from "../src/blocks/render-block-tree.js";
import type { EntryContent } from "../src/db/schema/entries.js";
import { signInAsAdmin } from "./support/session.js";

const codeBlock = (text: string): BlockNode => ({
  id: `code-${text}`,
  name: "core/code",
  attrs: { text },
});

const contentOf = (block: BlockNode): EntryContent => ({
  version: "plumix.v2",
  blocks: [block],
});

test.describe("a stale draft", () => {
  test("Use theirs replaces the local draft with the server's", async ({
    page,
    editor,
  }) => {
    const { admin, factories } = await signInAsAdmin(page);
    const theirs = codeBlock("theirs");
    const publishedAt = new Date();
    const entry = await factories.published.create({
      type: "article",
      authorId: admin.id,
      content: contentOf(theirs),
      updatedAt: publishedAt,
    });
    // Saved against the entry as it was before someone else published it.
    await factories.published.create({
      type: "autosave",
      slug: `autosave:${String(entry.id)}:${String(admin.id)}`,
      authorId: admin.id,
      content: contentOf(codeBlock("mine")),
      updatedAt: new Date(publishedAt.getTime() - 60_000),
    });
    await editor.open(entry);
    const dialog = editor.staleDraft.dialog;
    const code = editor.canvas.block("core/code");
    await expect(dialog).toBeVisible();
    await expect(code).toHaveText("mine");

    await editor.staleDraft.useTheirs();

    await expect(dialog).toHaveCount(0);
    await expect(code).toHaveText("theirs");
    await editor.reload();
    await expect(dialog).toHaveCount(0);
    await expect(code).toHaveText("theirs");
    expect(await editor.stored()).toEqual([theirs]);
  });
});
