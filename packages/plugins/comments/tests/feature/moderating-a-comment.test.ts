import { testSite } from "plumix/test";
import { describe, expect, test } from "vitest";

import { comments } from "../../src/index.js";
import { commentFactory } from "../../src/test/factories.js";
import { testBlog } from "../../src/test/harness.js";

const site = await testSite({
  plugins: [testBlog, comments()],
  factories: { comment: commentFactory },
});

describe("moderating a comment", () => {
  test("an editor approves a comment on a post they published", async () => {
    const editor = site.actingAs("editor");
    const post = await editor.rpc.entry.create({
      type: "post",
      title: "Hello",
      slug: "hello",
      status: "published",
    });
    const comment = await site.factory.comment.create({ entryId: post.id });

    const approved = await editor.rpc.comments.approve({ id: comment.id });

    expect(approved).toEqual({ status: "approved" });
  });

  test("a subscriber is refused", async () => {
    const post = await site.factory.published.create({ type: "post" });
    const comment = await site.factory.comment.create({ entryId: post.id });

    const approving = site
      .actingAs("subscriber")
      .rpc.comments.approve({ id: comment.id });

    await expect(approving).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });
});
