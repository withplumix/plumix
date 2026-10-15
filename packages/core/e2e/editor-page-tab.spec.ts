import { expect, test } from "@plumix/core/test/playwright";

import { ACCESS_POLICY_META_KEY } from "../src/access/contract/meta-key.js";
import { signInAsAdmin } from "./support/session.js";
import { storedEntry } from "./support/stored.js";

test.describe("the editor's Page tab", () => {
  test("the visibility control persists", async ({ page, editor }) => {
    const { admin, factories } = await signInAsAdmin(page);
    const entry = await factories.draft.create({
      type: "article",
      authorId: admin.id,
    });
    await editor.open(entry);
    await page.getByTestId("plumix-tab-page").click();
    const visibility = page.getByTestId("entry-visibility-select");

    await visibility.click();
    await page.getByTestId("entry-visibility-select-option-members").click();
    await editor.save();

    await editor.reload();
    await page.getByTestId("plumix-tab-page").click();
    await expect(visibility).toHaveText("Members only");
    const stored = await storedEntry(page, entry.id);
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
    await page.getByTestId("plumix-tab-page").click();
    const picker = page.getByTestId("entry-taxonomy-topic");

    await picker.click();
    await page
      .getByTestId(`entry-taxonomy-topic-option-${String(topic.id)}`)
      .click();
    await page.keyboard.press("Escape");
    await editor.save();

    await editor.reload();
    await expect(editor.canvas.frame.getByTestId("article-topics")).toHaveText(
      "Gardening",
    );
    await page.getByTestId("plumix-tab-page").click();
    await expect(picker).toHaveText("Gardening");
    const stored = await storedEntry(page, entry.id);
    expect(stored.terms.topic).toEqual([topic.id]);
  });
});
