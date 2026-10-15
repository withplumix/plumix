import { expect, test } from "@plumix/core/test/playwright";

import { signInAsAdmin } from "./support/session.js";

test.describe("the editor's Page tab", () => {
  test("the visibility control persists", async ({ page, editor }) => {
    const { admin, factories } = await signInAsAdmin(page);
    const entry = await factories.draft.create({
      type: "article",
      authorId: admin.id,
    });
    await editor.open(entry);

    await editor.document.setVisibility("members");
    await editor.save();

    await editor.reload();
    await expect(
      editor.canvas.frame.getByTestId("article-visibility"),
    ).toHaveText("members");
    await expect(await editor.document.visibility()).toHaveText("Members only");
    const stored = await editor.storedDocument();
    expect(stored.meta.__plumix_access).toBe("members");
  });

  test("a taxonomy picker persists", async ({ page, editor }) => {
    const { admin, factories } = await signInAsAdmin(page);
    const topic = await factories.term.create({
      taxonomy: "topic",
      name: "Gardening",
    });
    const entry = await factories.draft.create({
      type: "article",
      authorId: admin.id,
    });
    await editor.open(entry);

    await editor.document.toggleTerms("topic", [topic.id]);
    await editor.save();

    await editor.reload();
    await expect(editor.canvas.frame.getByTestId("article-topics")).toHaveText(
      "Gardening",
    );
    await expect(await editor.document.terms("topic")).toHaveText("Gardening");
    const stored = await editor.storedDocument();
    expect(stored.terms.topic).toEqual([topic.id]);
  });

  test("choosing the default visibility clears a policy", async ({
    page,
    editor,
  }) => {
    const { admin, factories } = await signInAsAdmin(page);
    const entry = await factories.draft.create({
      type: "article",
      authorId: admin.id,
      meta: { __plumix_access: "members" },
    });
    await editor.open(entry);

    await editor.document.setVisibility(null);
    await editor.save();

    await editor.reload();
    await expect(
      editor.canvas.frame.getByTestId("article-visibility"),
    ).toHaveText("default");
    await expect(await editor.document.visibility()).toHaveText("(default)");
    const stored = await editor.storedDocument();
    expect(stored.meta.__plumix_access).toBeUndefined();
  });

  test("a taxonomy picker drops a term", async ({ page, editor }) => {
    const { admin, factories } = await signInAsAdmin(page);
    const gardening = await factories.term.create({
      taxonomy: "topic",
      name: "Gardening",
    });
    const cooking = await factories.term.create({
      taxonomy: "topic",
      name: "Cooking",
    });
    const entry = await factories.draft.create({
      type: "article",
      authorId: admin.id,
    });
    await factories.entryTerm.create({
      entryId: entry.id,
      termId: gardening.id,
    });
    await factories.entryTerm.create({ entryId: entry.id, termId: cooking.id });
    await editor.open(entry);

    await editor.document.toggleTerms("topic", [gardening.id]);
    await editor.save();

    await editor.reload();
    await expect(editor.canvas.frame.getByTestId("article-topics")).toHaveText(
      "Cooking",
    );
    await expect(await editor.document.terms("topic")).toHaveText("Cooking");
    const stored = await editor.storedDocument();
    expect(stored.terms.topic).toEqual([cooking.id]);
  });
});
