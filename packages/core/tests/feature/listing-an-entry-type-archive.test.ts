import { describe, test } from "vitest";

import { ne } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { render } from "../../src/events-and-filters/render.js";
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

const shopPlugin = definePlugin("shop", {
  setup: (ctx) => {
    ctx.registerEntryType("product", {
      label: "Products",
      isPublic: true,
      hasArchive: true,
      rewrite: { slug: "shop" },
    });
  },
});

const docsPlugin = definePlugin("docs", {
  setup: (ctx) => {
    ctx.registerEntryType("doc", {
      label: "Docs",
      isPublic: true,
      hasArchive: true,
    });
  },
});

const siteTitleShortcodePlugin = definePlugin("site-title", {
  setup: (ctx) => {
    ctx.registerShortcode({
      name: "site-title",
      render: ({ context }) => {
        const title = context.siteSettings.title;
        return typeof title === "string" ? title : "";
      },
    });
  },
});

const YEAR = new Intl.DateTimeFormat("en", { year: "numeric" }).format(
  new Date(),
);

const site = await testSite({
  plugins: [blogPlugin, shopPlugin, docsPlugin, siteTitleShortcodePlugin],
});

describe("an entry type's archive", () => {
  test("lists published entries — newest first", async () => {
    await site.factory.published.create({
      type: "product",
      slug: "widget",
      title: "Widget",
      publishedAt: new Date("2026-04-20"),
    });
    await site.factory.published.create({
      type: "product",
      slug: "gadget",
      title: "Gadget",
      publishedAt: new Date("2026-04-21"),
    });

    const page = await site.visit("/shop");

    // Most recent first
    page
      .assertOk()
      .assertSee("<title>Products</title>")
      .assertSeeInOrder(["Gadget", "Widget"]);
  });

  test("expands a shortcode in a listed entry's title", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "best-of",
      title: "Best of [year]",
    });

    const page = await site.visit("/post");

    page.assertSee(`Best of ${YEAR}`).assertDontSee("[year]");
  });

  test("a listed entry's title shortcode reads the configured site settings", async () => {
    await site.factory.setting.create({
      group: "site",
      key: "title",
      value: "Acme",
    });
    await site.factory.published.create({
      type: "post",
      slug: "news",
      title: "News from [site-title]",
    });

    const page = await site.visit("/post");

    page.assertSee("News from Acme");
  });

  test("archive with no published entries renders the empty-state copy", async () => {
    const page = await site.visit("/post");

    page
      .assertOk()
      .assertSee("<title>Posts</title>")
      .assertSee("No entries yet.");
  });

  test("drafts do not appear in the archive", async () => {
    await site.factory.draft.create({
      type: "post",
      slug: "draft-one",
      title: "Draft One",
    });

    const page = await site.visit("/post");

    page.assertSee("No entries yet.").assertDontSee("Draft One");
  });

  test("page=2 returns the offset slice of entries", async () => {
    // Seed 25 entries — perPage=20 means page 2 has 5 entries.
    for (let i = 1; i <= 25; i++) {
      await site.factory.published.create({
        type: "product",
        slug: `p-${String(i).padStart(2, "0")}`,
        title: `Product ${String(i).padStart(2, "0")}`,
        publishedAt: new Date(`2026-04-${String(i).padStart(2, "0")}`),
      });
    }

    const page = await site.visit("/shop/page/2");

    // perPage=20, page 2 shows entries 1..5 (oldest, since newest are on page
    // 1)
    page
      .assertOk()
      .assertSee("Product 05")
      .assertSee("Product 01")
      .assertDontSee("Product 25")
      .assertDontSee("Product 06");
  });

  test("page > totalPages returns 404", async () => {
    await site.factory.published.create({
      type: "product",
      slug: "only-one",
      title: "Only One",
    });

    const page = await site.visit("/shop/page/99");

    page.assertNotFound();
  });

  test("non-numeric :page param returns 404", async () => {
    const page = await site.visit("/shop/page/abc");

    page.assertNotFound();
  });

  test("the bare archive answers 200", async () => {
    const page = await site.visit("/shop");

    page.assertOk();
  });

  test("explicit /page/1 canonical-redirects (301) to the bare archive", async () => {
    const page = await site.visit("/shop/page/1");

    page.assertStatus(301).assertRedirect("https://cms.example/shop");
  });

  test("empty archive on /page/1 redirects, not 404s (regression from #224)", async () => {
    const page = await site.visit("/post/page/1");

    page.assertStatus(301).assertRedirect("https://cms.example/post");
  });

  test("archive title falls back label → entryType when labels.plural is absent", async () => {
    const page = await site.visit("/doc");

    page.assertSee("<title>Docs</title>");
  });
});

const hideOne = definePlugin("hide-one", {
  setup: (ctx) => {
    ctx.filters.add(render.archiveEntries, (query) =>
      query.where(ne(entries.slug, "p-21")),
    );
  },
});

const filtered = await testSite({ plugins: [shopPlugin, hideOne] });

describe("an archive a render.archiveEntries handler narrows", () => {
  // One more than a page holds, so hiding one leaves no second page.
  async function seedOneMoreThanAPage() {
    for (let i = 1; i <= 21; i++) {
      await filtered.factory.published.create({
        type: "product",
        slug: `p-${String(i).padStart(2, "0")}`,
        title: `Product ${String(i).padStart(2, "0")}`,
        publishedAt: new Date(`2026-04-${String(i).padStart(2, "0")}`),
      });
    }
  }

  test("lists only what the handler leaves", async () => {
    await seedOneMoreThanAPage();

    const page = await filtered.visit("/shop");

    page.assertOk().assertSee("Product 01").assertDontSee("Product 21");
  });

  test("pagination counts only what a render.archiveEntries handler leaves", async () => {
    await seedOneMoreThanAPage();

    const page = await filtered.visit("/shop/page/2");

    page.assertNotFound();
  });
});
