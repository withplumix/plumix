import { describe, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
  },
});

const site = await testSite({ plugins: [blogPlugin] });

describe("a search query in the query string", () => {
  test("bare /search?q= 301s to the canonical /search/<q> path", async () => {
    const page = await site.visit("/search?q=hello%20world");

    page.assertStatus(301).assertHeader("location", "/search/hello%20world");
  });

  test("bare /search with no query renders the search page (no redirect)", async () => {
    const page = await site.visit("/search");

    page.assertOk();
  });
});
