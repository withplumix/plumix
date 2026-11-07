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

/** `Post 01` to `Post <count>`, published one a day from 2026-04-01. */
async function seedDailyPosts(authorId: number, count: number): Promise<void> {
  for (let day = 1; day <= count; day++) {
    const dd = String(day).padStart(2, "0");
    await site.factory.published.create({
      type: "post",
      slug: `p-${dd}`,
      title: `Post ${dd}`,
      authorId,
      publishedAt: new Date(`2026-04-${dd}`),
    });
  }
}

describe("an author archive", () => {
  test("/author/{slug} lists that author's published entries, newest first", async () => {
    const jane = await site.factory.author.create({
      name: "Jane",
      slug: "jane",
    });
    const john = await site.factory.author.create({
      name: "John",
      slug: "john",
    });
    await site.factory.published.create({
      type: "post",
      slug: "janes-older",
      title: "Janes Older",
      authorId: jane.id,
      publishedAt: new Date("2026-04-20"),
    });
    await site.factory.published.create({
      type: "post",
      slug: "janes-newer",
      title: "Janes Newer",
      authorId: jane.id,
      publishedAt: new Date("2026-04-21"),
    });
    await site.factory.published.create({
      type: "post",
      slug: "johns-post",
      title: "Johns Post",
      authorId: john.id,
      publishedAt: new Date("2026-04-22"),
    });

    const page = await site.visit("/authors/jane");

    // data.author is wired — the theme rendered the author's name + title.
    // Only this author's entries, newest first.
    page
      .assertOk()
      .assertSee("<title>Jane</title>")
      .assertSeeInOrder(["Janes Newer", "Janes Older"])
      .assertDontSee("Johns Post");
  });

  test("unknown author slug returns 404", async () => {
    const page = await site.visit("/authors/nobody");

    page.assertNotFound();
  });

  test("an author with no published entries renders the empty state (200)", async () => {
    await site.factory.author.create({ name: "Quiet", slug: "quiet" });

    const page = await site.visit("/authors/quiet");

    page
      .assertOk()
      .assertSee("<title>Quiet</title>")
      .assertSee("No entries yet.");
  });

  test("drafts and other authors' posts are excluded", async () => {
    const jane = await site.factory.author.create({
      name: "Jane",
      slug: "jane",
    });
    await site.factory.draft.create({
      type: "post",
      slug: "janes-draft",
      title: "Janes Draft",
      authorId: jane.id,
    });

    const page = await site.visit("/authors/jane");

    page.assertSee("No entries yet.").assertDontSee("Janes Draft");
  });

  test("pagination: /author/{slug}/page/2 returns the offset slice", async () => {
    const jane = await site.factory.author.create({
      name: "Jane",
      slug: "jane",
    });
    await seedDailyPosts(jane.id, 25);

    const page = await site.visit("/authors/jane/page/2");

    // perPage=20, page 2 shows the 5 oldest.
    page
      .assertOk()
      .assertSee("Post 05")
      .assertSee("Post 01")
      .assertDontSee("Post 25");
  });

  test("out-of-range page returns 404", async () => {
    const jane = await site.factory.author.create({
      name: "Jane",
      slug: "jane",
    });
    await site.factory.published.create({
      type: "post",
      slug: "only",
      title: "Only",
      authorId: jane.id,
    });

    const page = await site.visit("/authors/jane/page/99");

    page.assertNotFound();
  });

  test("explicit /page/1 canonical-redirects (301) to the bare author archive", async () => {
    await site.factory.author.create({ name: "Jane", slug: "jane" });

    const page = await site.visit("/authors/jane/page/1");

    page
      .assertStatus(301)
      .assertHeader("location", "https://cms.example/authors/jane");
  });
});
