import { expect, test } from "@plumix/core/test/playwright";

import { ACCESS_POLICY_META_KEY } from "../src/access/contract/meta-key.js";
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
    expect(await editor.document.visibility()).toBe("Members only");
    const stored = await editor.storedDocument();
    expect(stored.meta[ACCESS_POLICY_META_KEY]).toBe("members");
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
    expect(await editor.document.terms("topic")).toBe("Gardening");
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
      meta: { [ACCESS_POLICY_META_KEY]: "members" },
    });
    await editor.open(entry);

    await editor.document.setVisibility(null);
    await editor.save();

    await editor.reload();
    await expect(
      editor.canvas.frame.getByTestId("article-visibility"),
    ).toHaveText("default");
    expect(await editor.document.visibility()).toBe("(default)");
    const stored = await editor.storedDocument();
    expect(stored.meta[ACCESS_POLICY_META_KEY]).toBeUndefined();
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
    expect(await editor.document.terms("topic")).toBe("Cooking");
    const stored = await editor.storedDocument();
    expect(stored.terms.topic).toEqual([cooking.id]);
  });
});
