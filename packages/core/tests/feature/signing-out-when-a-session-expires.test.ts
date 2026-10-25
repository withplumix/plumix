import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [posts] });

describe("a session past its lifetime", () => {
  test("is refused as signed out", async () => {
    const editor = site.actingAs("editor");
    await editor.rpc.entry.create({
      type: "post",
      title: "Before",
      slug: "before",
    });

    site.travel({ days: 31 });
    const creating = editor.rpc.entry.create({
      type: "post",
      title: "After",
      slug: "after",
    });

    await expect(creating).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
  });
});
