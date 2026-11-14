import { describe, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerEntryType("page", { label: "Pages", isPublic: true });
    ctx.registerEntryMetaBox("featuring", {
      label: "Featuring",
      entryTypes: ["post"],
      fields: [
        {
          key: "featured",
          label: "Featured",
          type: "string",
          inputType: "entry",
          referenceTarget: { kind: "entry", scope: { entryTypes: ["page"] } },
        },
      ],
    });
  },
});

const site = await testSite({ plugins: [blog] });

describe("a page whose reference names a draft", () => {
  // The draft rendered as nothing, so its publish is the change the page shows.
  test("is purged when the draft is published", async () => {
    const draft = await site.factory.draft.create({ type: "page" });
    await site.factory.published.create({
      type: "post",
      slug: "hello",
      meta: { featured: String(draft.id) },
    });
    await site.visit("/post/hello");
    site.cdn.assertStored("/post/hello");

    await site.actingAs("editor").rpc.entry.update({
      id: draft.id,
      status: "published",
      ifMatch: etagOf(draft.updatedAt),
    });

    site.cdn.assertNotStored("/post/hello");
  });
});
