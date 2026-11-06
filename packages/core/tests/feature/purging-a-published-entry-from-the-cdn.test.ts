import { describe, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [posts] });

describe("publishing an entry", () => {
  test("purges its tag and its type's tag", async () => {
    const post = await site.actingAs("editor").rpc.entry.create({
      type: "post",
      title: "Hello",
      slug: "hello",
      status: "published",
    });

    site.cdn.assertPurged(`e:${String(post.id)}`);
    site.cdn.assertPurged("t:post");
  });

  test("starts the next test with nothing purged", () => {
    site.cdn.assertNothingPurged();
  });
});
