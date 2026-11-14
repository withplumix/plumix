import { definePlugin } from "plumix/plugin";
import { testSite } from "plumix/test";
import { describe, expect, test } from "vitest";

import { seo } from "../index.js";
import dataMigrations from "./data-migrations.js";

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [blog, seo()] });

const [seedNoindexedEntries] = dataMigrations;

describe("seeding the noindexed entries", () => {
  test("takes entries already marked noindex out of the sitemap", async () => {
    // Written straight to the row, as a site that ran an earlier seo has them.
    await site.factory.published.create({
      type: "post",
      slug: "hidden",
      meta: { seo_noindex: true },
    });
    await site.factory.published.create({
      type: "post",
      slug: "listed",
      meta: { seo_noindex: false },
    });

    await seedNoindexedEntries.up({ db: site.context.db });

    const { body } = await site.visit("/sitemap-entries-post-0.xml");
    expect(body).toContain("<url><loc>https://cms.example/post/listed</loc>");
    expect(body).not.toContain("/post/hidden");
  });
});
