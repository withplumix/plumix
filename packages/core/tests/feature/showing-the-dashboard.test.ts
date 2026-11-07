import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

/** `news` pools onto `post`'s capabilities, so `entry:news:*` is never minted. */
const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryType("news", { label: "News", capabilityType: "post" });
  },
});

const site = await testSite({ plugins: [posts] });

describe("the dashboard's entry counts", () => {
  test("count a type pooled onto another's capabilities", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.published.create({
      authorId: editor.id,
      type: "news",
      slug: "n1",
    });

    const stats = await site.actingAs(editor).rpc.entry.stats();

    expect(stats).toContainEqual({
      type: "news",
      status: "published",
      count: 1,
    });
  });

  test("count each type's entries by status", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.published.create({ authorId: editor.id, slug: "p1" });
    await site.factory.published.create({ authorId: editor.id, slug: "p2" });
    await site.factory.draft.create({ authorId: editor.id, slug: "d1" });
    await site.factory.trashed.create({ authorId: editor.id, slug: "t1" });

    const stats = await site.actingAs(editor).rpc.entry.stats();

    expect(stats.filter((s) => s.type === "post")).toEqual(
      expect.arrayContaining([
        { type: "post", status: "published", count: 2 },
        { type: "post", status: "draft", count: 1 },
        { type: "post", status: "trash", count: 1 },
      ]),
    );
  });

  test("never count revisions", async () => {
    const admin = await site.factory.admin.create();
    await site.factory.published.create({ authorId: admin.id, slug: "vis" });
    await site.factory.entry.create({
      authorId: admin.id,
      type: "revision",
      slug: "revision:1:abcdefghijklmnopqrstu",
    });

    const stats = await site.actingAs(admin).rpc.entry.stats();

    expect(stats.map((s) => s.type)).not.toContain("revision");
  });

  test("show a member published counts but not drafts or trash", async () => {
    // A member reads posts but cannot edit any, so draft and trash counts
    // stay hidden, as `entry.list` and `entry.get` hide those rows.
    const member = await site.factory.member.create();
    await site.factory.published.create({ authorId: member.id, slug: "pub" });
    await site.factory.draft.create({ authorId: member.id, slug: "dr" });
    await site.factory.trashed.create({ authorId: member.id, slug: "tr" });

    const stats = await site.actingAs(member).rpc.entry.stats();

    expect(stats.filter((s) => s.type === "post")).toEqual([
      { type: "post", status: "published", count: 1 },
    ]);
  });

  test("count an author's own drafts but not another author's", async () => {
    const author = await site.factory.author.create();
    const other = await site.factory.author.create();
    await site.factory.draft.create({ authorId: author.id, slug: "mine" });
    await site.factory.trashed.create({ authorId: author.id, slug: "binned" });
    await site.factory.draft.create({ authorId: other.id, slug: "theirs" });
    await site.factory.trashed.create({
      authorId: other.id,
      slug: "their-bin",
    });
    await site.factory.published.create({ authorId: other.id, slug: "pub" });

    const stats = await site.actingAs(author).rpc.entry.stats();

    const counts = stats.filter((s) => s.type === "post");
    expect(counts).toHaveLength(3);
    expect(counts).toEqual(
      expect.arrayContaining([
        { type: "post", status: "published", count: 1 },
        { type: "post", status: "draft", count: 1 },
        { type: "post", status: "trash", count: 1 },
      ]),
    );
  });
});

describe("the dashboard's recent activity", () => {
  test("lists entries newest first, leaving out trash", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.published.create({ authorId: editor.id, slug: "old" });
    await site.factory.published.create({ authorId: editor.id, slug: "new" });
    await site.factory.trashed.create({ authorId: editor.id, slug: "binned" });

    const recent = await site
      .actingAs(editor)
      .rpc.entry.recentActivity({ limit: 10 });

    expect(recent.map((r) => r.slug)).toEqual(["new", "old"]);
  });

  test("shows an author their own drafts but not another author's, and never trash", async () => {
    const author = await site.factory.author.create();
    const other = await site.factory.author.create();
    await site.factory.draft.create({ authorId: author.id, slug: "mine" });
    await site.factory.trashed.create({ authorId: author.id, slug: "binned" });
    await site.factory.draft.create({ authorId: other.id, slug: "theirs" });
    await site.factory.published.create({ authorId: other.id, slug: "pub" });

    const recent = await site
      .actingAs(author)
      .rpc.entry.recentActivity({ limit: 10 });

    expect(recent.map((r) => r.slug).sort()).toEqual(["mine", "pub"]);
  });
});
