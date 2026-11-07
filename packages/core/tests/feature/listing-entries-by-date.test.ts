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

/** One post per given ISO date, titled by its date. */
async function seedDated(dates: readonly string[]): Promise<void> {
  for (const iso of dates) {
    await site.factory.published.create({
      type: "post",
      slug: `post-${iso}`,
      title: `Post ${iso}`,
      publishedAt: new Date(`${iso}T12:00:00Z`),
    });
  }
}

describe("a date archive", () => {
  test("/YYYY lists the year's posts and excludes other years", async () => {
    await seedDated(["2026-03-10", "2026-11-02", "2025-12-31", "2027-01-01"]);

    const page = await site.visit("/2026");

    page
      .assertOk()
      .assertSee("Post 2026-03-10")
      .assertSee("Post 2026-11-02")
      .assertDontSee("Post 2025-12-31")
      .assertDontSee("Post 2027-01-01");
  });

  test("/YYYY/MM narrows to the month; boundaries are half-open", async () => {
    // Month boundaries: Jul 1 in, Jun 30 out, Aug 1 out.
    await seedDated(["2026-07-01", "2026-07-31", "2026-06-30", "2026-08-01"]);

    const page = await site.visit("/2026/07");

    page
      .assertOk()
      .assertSee("Post 2026-07-01")
      .assertSee("Post 2026-07-31")
      .assertDontSee("Post 2026-06-30")
      .assertDontSee("Post 2026-08-01");
  });

  test("/YYYY/MM/DD narrows to the single day", async () => {
    await seedDated(["2026-07-21", "2026-07-20", "2026-07-22"]);

    const page = await site.visit("/2026/07/21");

    page
      .assertOk()
      .assertSee("Post 2026-07-21")
      .assertDontSee("Post 2026-07-20")
      .assertDontSee("Post 2026-07-22");
  });

  test.each([
    "/1999",
    "/1999/page/2",
    "/2026/06",
    "/2026/06/page/2",
    "/2026/07/20",
    "/2026/07/20/page/3",
  ])(
    "an empty period (%s) is a 404, not an empty archive (ADR 0029)",
    async (path) => {
      await seedDated(["2026-07-21"]);

      const page = await site.visit(path);

      page.assertNotFound();
    },
  );

  test.each(["/2026/13", "/2026/02/30", "/2026/00"])(
    "an impossible date (%s) returns 404",
    async (path) => {
      const page = await site.visit(path);

      page.assertNotFound();
    },
  );

  test("pagination: /YYYY/page/2 returns the offset slice", async () => {
    await seedDated(
      Array.from(
        { length: 25 },
        (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`,
      ),
    );

    const page = await site.visit("/2026/page/2");

    // 25 posts, perPage 20 → page 2 has the 5 oldest.
    page
      .assertOk()
      .assertSee("Post 2026-01-05")
      .assertSee("Post 2026-01-01")
      .assertDontSee("Post 2026-01-25");
  });

  test("out-of-range page returns 404", async () => {
    await seedDated(["2026-05-05"]);

    const page = await site.visit("/2026/page/9");

    page.assertNotFound();
  });

  test("explicit /page/1 canonical-redirects (301) to the bare period", async () => {
    const page = await site.visit("/2026/07/page/1");

    page
      .assertStatus(301)
      .assertHeader("location", "https://cms.example/2026/07");
  });
});
