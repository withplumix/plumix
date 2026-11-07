import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { buildTermArchiveUrl } from "../../src/route/permalink.js";
import { testSite } from "../../src/test/site.js";

const YEAR = new Intl.DateTimeFormat("en", { year: "numeric" }).format(
  new Date(),
);

const taxonomyPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      entryTypes: ["post"],
    });
  },
});

const site = await testSite({ plugins: [taxonomyPlugin] });

describe("a term archive", () => {
  test("returns 404 when the term slug doesn't exist", async () => {
    const page = await site.visit("/category/missing");

    page.assertNotFound();
  });

  test("renders a 200 empty archive when the term exists but has no entries", async () => {
    await site.factory.category.create({ slug: "news", name: "News" });

    const page = await site.visit("/category/news");

    page.assertOk().assertSee("<h1>News</h1>").assertSee("No entries yet.");
  });

  test("expands a shortcode in a listed entry's title", async () => {
    const term = await site.factory.category.create({
      slug: "news",
      name: "News",
    });
    const entry = await site.factory.published.create({
      type: "post",
      slug: "best-of",
      title: "Best of [year]",
    });
    await site.factory.entryTerm.create({ entryId: entry.id, termId: term.id });

    const page = await site.visit("/category/news");

    page.assertSee(`Best of ${YEAR}`).assertDontSee("[year]");
  });

  test("lists published entries tagged with the term, newest first", async () => {
    const term = await site.factory.category.create({
      slug: "news",
      name: "News",
    });
    const older = await site.factory.published.create({
      type: "post",
      slug: "older",
      title: "Older",
      publishedAt: new Date("2026-04-01"),
    });
    const newer = await site.factory.published.create({
      type: "post",
      slug: "newer",
      title: "Newer",
      publishedAt: new Date("2026-04-20"),
    });
    await site.factory.entryTerm.create({ entryId: older.id, termId: term.id });
    await site.factory.entryTerm.create({ entryId: newer.id, termId: term.id });

    const page = await site.visit("/category/news");

    page.assertOk().assertSeeInOrder(["Newer", "Older"]);
  });

  test("taxonomy page=2 returns the offset slice of tagged entries", async () => {
    const term = await site.factory.category.create({
      slug: "news",
      name: "News",
    });
    for (let day = 1; day <= 25; day++) {
      const dd = String(day).padStart(2, "0");
      const post = await site.factory.published.create({
        type: "post",
        slug: `p-${dd}`,
        title: `Tagged ${dd}`,
        publishedAt: new Date(`2026-04-${dd}`),
      });
      await site.factory.entryTerm.create({
        entryId: post.id,
        termId: term.id,
      });
    }

    const page = await site.visit("/category/news/page/2");

    // perPage=20, page 2 shows the oldest 5 entries (newest 20 on page 1).
    page
      .assertOk()
      .assertSee("Tagged 05")
      .assertSee("Tagged 01")
      .assertDontSee("Tagged 25")
      .assertDontSee("Tagged 06");
  });

  test("taxonomy page > totalPages returns 404", async () => {
    const term = await site.factory.category.create({
      slug: "news",
      name: "News",
    });
    const post = await site.factory.published.create({
      type: "post",
      slug: "only",
      title: "Only",
    });
    await site.factory.entryTerm.create({ entryId: post.id, termId: term.id });

    const page = await site.visit("/category/news/page/99");

    page.assertNotFound();
  });

  test("empty term on /page/1 redirects, not 404s (regression from #224)", async () => {
    await site.factory.category.create({ slug: "empty", name: "Empty" });

    const page = await site.visit("/category/empty/page/1");

    page
      .assertStatus(301)
      .assertHeader("location", "https://cms.example/category/empty");
  });

  test("draft entries tagged with the term are excluded", async () => {
    const term = await site.factory.category.create({
      slug: "news",
      name: "News",
    });
    const draft = await site.factory.draft.create({
      type: "post",
      slug: "draft",
      title: "Draft",
    });
    await site.factory.entryTerm.create({ entryId: draft.id, termId: term.id });

    const page = await site.visit("/category/news");

    page.assertSee("No entries yet.").assertDontSee("Draft");
  });
});

const multiTypePlugin = definePlugin("multi", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerEntryType("doc", { label: "Docs", isPublic: true });
    ctx.registerTermTaxonomy("topic", {
      label: "Topics",
      entryTypes: ["post", "doc"],
    });
  },
});

const multiTypeSite = await testSite({ plugins: [multiTypePlugin] });

describe("a term archive of a taxonomy across entry types", () => {
  test("cross-entry-type taxonomy includes entries from every attached type", async () => {
    const term = await multiTypeSite.factory.term.create({
      taxonomy: "topic",
      slug: "edge",
      name: "Edge",
    });
    const post = await multiTypeSite.factory.published.create({
      type: "post",
      slug: "p",
      title: "Post P",
      publishedAt: new Date("2026-04-10"),
    });
    const doc = await multiTypeSite.factory.published.create({
      type: "doc",
      slug: "d",
      title: "Doc D",
      publishedAt: new Date("2026-04-20"),
    });
    await multiTypeSite.factory.entryTerm.create({
      entryId: post.id,
      termId: term.id,
    });
    await multiTypeSite.factory.entryTerm.create({
      entryId: doc.id,
      termId: term.id,
    });

    const page = await multiTypeSite.visit("/topic/edge");

    page
      .assertOk()
      .assertSee('<a href="/post/p">Post P</a>')
      .assertSee('<a href="/doc/d">Doc D</a>');
  });
});

/**
 * A hierarchical `region` taxonomy; `places` adds a plugin's own
 * `/places/:term` rule on top of the nested auto route.
 */
function geoPlugin(options: { places?: boolean } = {}) {
  return definePlugin("geo", {
    setup: (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerTermTaxonomy("region", {
        label: "Regions",
        isHierarchical: true,
        entryTypes: ["post"],
      });
      if (options.places === true) {
        ctx.registerRewriteRule("/places/:term", {
          kind: "term",
          taxonomy: "region",
        });
      }
    },
  });
}

const geoSite = await testSite({ plugins: [geoPlugin()] });
const placesSite = await testSite({ plugins: [geoPlugin({ places: true })] });
const subdirectorySite = await testSite({
  plugins: [geoPlugin()],
  config: { basePath: "/blog" },
});

/** Europe > France, with a published post `Wine` filed under France. */
async function seedRegions(on: typeof geoSite) {
  const europe = await on.factory.term.create({
    taxonomy: "region",
    slug: "europe",
    name: "Europe",
  });
  const france = await on.factory.term.create({
    taxonomy: "region",
    slug: "france",
    name: "France",
    parentId: europe.id,
  });
  const post = await on.factory.published.create({
    type: "post",
    slug: "wine",
    title: "Wine",
  });
  await on.factory.entryTerm.create({ entryId: post.id, termId: france.id });
  return { europe, france };
}

describe("a term archive of a hierarchical taxonomy", () => {
  test("hierarchical taxonomy /<base>/parent/leaf resolves the nested term", async () => {
    await seedRegions(geoSite);

    const page = await geoSite.visit("/region/europe/france");

    page.assertOk().assertSee("<h1>France</h1>").assertSee("Wine");
  });

  test("buildTermArchiveUrl round-trips through the route map", async () => {
    const { france } = await seedRegions(geoSite);
    const url = await buildTermArchiveUrl(geoSite.context, {
      taxonomy: "region",
      slug: france.slug,
      parentId: france.parentId,
    });
    expect(url).toBe("/region/europe/france");

    const page = await geoSite.visit(url ?? "");

    page.assertOk().assertSee("<h1>France</h1>");
  });

  test("paginated hierarchical taxonomy resolves /region/europe/france/page/2", async () => {
    const europe = await geoSite.factory.term.create({
      taxonomy: "region",
      slug: "europe",
      name: "Europe",
    });
    const france = await geoSite.factory.term.create({
      taxonomy: "region",
      slug: "france",
      name: "France",
      parentId: europe.id,
    });
    for (let day = 1; day <= 25; day++) {
      const dd = String(day).padStart(2, "0");
      const post = await geoSite.factory.published.create({
        type: "post",
        slug: `p-${dd}`,
        title: `Wine ${dd}`,
        publishedAt: new Date(`2026-04-${dd}`),
      });
      await geoSite.factory.entryTerm.create({
        entryId: post.id,
        termId: france.id,
      });
    }

    const page = await geoSite.visit("/region/europe/france/page/2");

    // perPage=20, page 2 shows the oldest 5.
    page
      .assertOk()
      .assertSee("Wine 05")
      .assertSee("Wine 01")
      .assertDontSee("Wine 25")
      .assertDontSee("Wine 06");
  });

  test("a plugin rule capturing :term lists a nested term of a nested-URL taxonomy", async () => {
    await seedRegions(placesSite);

    const page = await placesSite.visit("/places/france");

    page.assertOk().assertSee("<h1>France</h1>").assertSee("Wine");
  });

  test("a plugin rule capturing :term still lists a top-level term", async () => {
    await seedRegions(placesSite);

    const page = await placesSite.visit("/places/europe");

    page.assertOk().assertSee("<h1>Europe</h1>");
  });

  test("a plugin rule's URL is served as it is, never redirected to the term's canonical URL", async () => {
    await seedRegions(placesSite);

    const page = await placesSite.visit("/places/france?ref=feed");

    page.assertOk().assertHeaderMissing("location");
  });

  test.each([
    ["a nested term's bare slug", "/region/france"],
    ["a path through the wrong ancestor", "/region/asia/france"],
  ])("%s on core's route 301s to the canonical URL", async (_case, path) => {
    await seedRegions(geoSite);

    const page = await geoSite.visit(path);

    page
      .assertStatus(301)
      .assertHeader("location", "https://cms.example/region/europe/france");
  });

  test.each(["/region/europe/france", "/region/europe"])(
    "the canonical URL %s serves without a redirect",
    async (path) => {
      await seedRegions(geoSite);

      const page = await geoSite.visit(path);

      page.assertOk();
    },
  );

  test("a non-canonical later page 301s with its page number, base path and query string kept", async () => {
    await seedRegions(subdirectorySite);

    const page = await subdirectorySite.visit(
      "/blog/region/france/page/2?utm=x",
    );

    page
      .assertStatus(301)
      .assertHeader(
        "location",
        "https://cms.example/blog/region/europe/france/page/2?utm=x",
      );
  });
});
