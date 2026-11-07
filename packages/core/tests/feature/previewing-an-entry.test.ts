import { describe, expect, test } from "vitest";

import { verifyPreviewToken } from "../../src/auth/preview-token.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

/** A permalink needs the type registered and public. */
const content = definePlugin("content", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      isHierarchical: true,
    });
  },
});

const site = await testSite({ plugins: [content] });

describe("a preview link", () => {
  test("is minted with a token for a draft the caller can edit", async () => {
    const draft = await site.factory.draft.create({ slug: "secret-draft" });

    const result = await site
      .actingAs("editor")
      .rpc.entry.createPreviewLink({ id: draft.id });

    expect(result.url).toBe(`/post/secret-draft?preview=${result.token}`);
    expect(await verifyPreviewToken(site.context.db, result.token)).toBe(
      draft.id,
    );
  });

  test("walks a nested page's ancestors into its url", async () => {
    const parent = await site.factory.published.create({
      type: "page",
      slug: "docs",
    });
    const child = await site.factory.draft.create({
      type: "page",
      slug: "unreleased",
      parentId: parent.id,
    });

    const result = await site
      .actingAs("editor")
      .rpc.entry.createPreviewLink({ id: child.id });

    expect(result.url).toBe(`/page/docs/unreleased?preview=${result.token}`);
  });

  // An author has neither edit_any nor authorship of another's draft.
  test("is not minted for a draft the caller can't read", async () => {
    const draft = await site.factory.draft.create({ slug: "not-mine" });

    const mint = site
      .actingAs("author")
      .rpc.entry.createPreviewLink({ id: draft.id });

    await expect(mint).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("is not minted for an entry that does not exist", async () => {
    const mint = site
      .actingAs("editor")
      .rpc.entry.createPreviewLink({ id: 9999 });

    await expect(mint).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
