import { describe, expect, test } from "vitest";

import { eq } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

/**
 * A meta box on `post`, with no entry type registered: `post` reaches only
 * core's built-in `entry:post:*` capabilities.
 */
const seo = definePlugin("seo", {
  setup: (ctx) => {
    ctx.registerEntryMetaBox("test-seo", {
      label: "SEO",
      entryTypes: ["post"],
      fields: [
        {
          key: "meta_title",
          label: "Meta title",
          type: "string",
          inputType: "text",
        },
        {
          key: "is_featured",
          label: "Featured",
          type: "boolean",
          inputType: "checkbox",
        },
      ],
    });
  },
});

const site = await testSite({ plugins: [seo] });

describe("reading an entry", () => {
  test("a published entry comes back", async () => {
    const member = await site.factory.member.create();
    const post = await site.factory.published.create({ authorId: member.id });

    const got = await site.actingAs(member).rpc.entry.get({ id: post.id });

    expect(got.id).toBe(post.id);
  });

  test("an entry that does not exist answers not found", async () => {
    const get = site.actingAs("admin").rpc.entry.get({ id: 9999 });

    await expect(get).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("another's draft answers a member not found, hiding that it exists", async () => {
    const hidden = await site.factory.draft.create({ slug: "hidden" });

    const get = site.actingAs("member").rpc.entry.get({ id: hidden.id });

    await expect(get).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("an author with edit_own reads their own draft", async () => {
    const author = await site.factory.author.create();
    const mine = await site.factory.draft.create({
      authorId: author.id,
      slug: "my-draft",
    });

    const got = await site.actingAs(author).rpc.entry.get({ id: mine.id });

    expect(got.status).toBe("draft");
  });

  test("an editor reads anyone's draft", async () => {
    const theirs = await site.factory.draft.create({ slug: "others-draft" });

    const got = await site.actingAs("editor").rpc.entry.get({ id: theirs.id });

    expect(got.id).toBe(theirs.id);
  });

  test("comes with an empty meta bag when nothing is stored", async () => {
    const post = await site.factory.published.create();

    const got = await site.actingAs("admin").rpc.entry.get({ id: post.id });

    expect(got.meta).toEqual({});
  });

  test("decodes the stored meta bag against the registered fields", async () => {
    const post = await site.factory.published.create();
    // Written straight to the column, past the RPC sanitizer, to prove the
    // reader decodes what the writer laid down.
    await site.context.db
      .update(entries)
      .set({ meta: { meta_title: "Seeded", is_featured: true } })
      .where(eq(entries.id, post.id));

    const got = await site.actingAs("admin").rpc.entry.get({ id: post.id });

    expect(got.meta).toEqual({ meta_title: "Seeded", is_featured: true });
  });
});

// Preview overlays a pending draft, so it uses the edit gate. Denials always
// name `edit_any`, or the message would reveal authorship of an unseen row.
describe("reading an entry for preview", () => {
  test("a member previewing their own published entry is told edit_any", async () => {
    const member = await site.factory.member.create();
    const mine = await site.factory.published.create({ authorId: member.id });

    const get = site
      .actingAs(member)
      .rpc.entry.get({ id: mine.id, preview: true });

    await expect(get).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:edit_any" },
    });
  });

  test("an author previewing another's published entry is told the same", async () => {
    const theirs = await site.factory.published.create();

    const get = site
      .actingAs("author")
      .rpc.entry.get({ id: theirs.id, preview: true });

    await expect(get).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:edit_any" },
    });
  });
});
