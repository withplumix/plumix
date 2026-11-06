import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [posts] });

describe("a request the site served", () => {
  test("records its dispatch span with the status it answered", async () => {
    const post = await site.factory.published.create({ title: "Hello" });

    await site.visit(post);

    expect(
      site.telemetry.span("dispatch").attributes["http.response.status_code"],
    ).toBe(200);
  });

  test("starts the next test with nothing recorded", () => {
    expect(site.telemetry.snapshots).toEqual([]);
  });
});
