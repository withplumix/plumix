import { describe, expect, test } from "vitest";

import { entryCapability } from "../../src/access/contract/capability.js";
import { etagOf } from "../../src/db/concurrency.js";
import { definePlugin } from "../../src/plugin/define.js";
import { text } from "../../src/plugin/fields/builder.js";
import { testSite } from "../../src/test/site.js";

/** `news` pools its permissions with `post`, so `entry:news:*` is never minted. */
const site = await testSite({
  plugins: [
    definePlugin("newsroom", {
      setup: (ctx) => {
        ctx.registerEntryType("post", { label: "Posts" });
        ctx.registerEntryType("news", {
          label: "News",
          capabilityType: "post",
        });
        ctx.registerEntryMetaBox("desk", {
          label: "Desk",
          entryTypes: ["news"],
          fields: [text("desk").capability(entryCapability("news", "publish"))],
        });
        ctx.registerEntryMetaBox("private", {
          label: "Private",
          entryTypes: ["post"],
          fields: [
            {
              key: "private_note",
              label: "Private note",
              type: "string",
              inputType: "text",
              capability: "view_private_notes",
            },
          ],
        });
      },
    }),
  ],
  config: {
    // Writes posts but never publishes them.
    roles: {
      contributor: {
        can: {
          admin: ["access"],
          user: ["edit_own"],
          entry: { post: ["read", "create", "edit_own"] },
          term: { category: ["read", "assign"], tag: ["read", "assign"] },
        },
      },
    },
  },
});

describe("an author updating an entry", () => {
  test("renames their own draft", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      title: "renamed",
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.title).toBe("renamed");
  });

  test("is refused someone else's draft, told the stronger capability so authorship isn't probed", async () => {
    const author = await site.factory.author.create();
    const theirs = await site.factory.draft.create();

    const update = site.actingAs(author).rpc.entry.update({
      id: theirs.id,
      title: "hax",
      ifMatch: etagOf(theirs.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:edit_any" },
    });
  });

  test("renames their own draft of a type pooled onto post through entry:post:edit_own", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      type: "news",
    });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      title: "mine",
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.title).toBe("mine");
  });

  test("is refused another author's draft of a pooled type, told entry:post:edit_any", async () => {
    const author = await site.factory.author.create();
    const theirs = await site.factory.draft.create({ type: "news" });

    const update = site.actingAs(author).rpc.entry.update({
      id: theirs.id,
      title: "hax",
      ifMatch: etagOf(theirs.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:edit_any" },
    });
  });

  test("writes a meta field gated under the namespace its pooled type pools into", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      type: "news",
    });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      meta: { desk: "city" },
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.meta.desk).toBe("city");
  });

  test("is refused a meta field gated by a capability they lack", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({ authorId: author.id });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      meta: { private_note: "leaked" },
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "view_private_notes" },
    });
  });
});

describe("an editor updating an entry", () => {
  test("renames a draft of a type pooled onto post's capabilities", async () => {
    const editor = await site.factory.editor.create();
    const draft = await site.factory.draft.create({
      authorId: editor.id,
      type: "news",
    });

    const updated = await site.actingAs(editor).rpc.entry.update({
      id: draft.id,
      title: "renamed",
      ifMatch: etagOf(draft.updatedAt),
    });

    expect(updated.title).toBe("renamed");
  });

  test("renames anyone's draft", async () => {
    const theirs = await site.factory.draft.create();

    const updated = await site.actingAs("editor").rpc.entry.update({
      id: theirs.id,
      title: "by-editor",
      ifMatch: etagOf(theirs.updatedAt),
    });

    expect(updated.title).toBe("by-editor");
  });
});

describe("a member updating an entry", () => {
  test("is told edit_any even for their own draft, so authorship isn't probed", async () => {
    const member = await site.factory.member.create();
    const own = await site.factory.draft.create({ authorId: member.id });

    const update = site.actingAs(member).rpc.entry.update({
      id: own.id,
      title: "x",
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:edit_any" },
    });
  });
});

describe("a contributor updating an entry", () => {
  test("cannot promote their own draft to published", async () => {
    const contributor = await site.factory.user.create({
      role: "contributor",
    });
    const own = await site.factory.draft.create({ authorId: contributor.id });

    const update = site.actingAs(contributor).rpc.entry.update({
      id: own.id,
      status: "published",
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:publish" },
    });
  });

  test("is refused a meta field gated under the namespace its pooled type pools into", async () => {
    const contributor = await site.factory.user.create({
      role: "contributor",
    });
    const own = await site.factory.draft.create({
      authorId: contributor.id,
      type: "news",
    });

    const update = site.actingAs(contributor).rpc.entry.update({
      id: own.id,
      meta: { desk: "city" },
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:publish" },
    });
  });
});
