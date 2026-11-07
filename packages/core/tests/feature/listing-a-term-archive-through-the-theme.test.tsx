import { describe, test } from "vitest";

import type { ResolvedEntry } from "../../src/route/contract/resolved-entry.js";
import { entries as entriesTable } from "../../src/db/schema/entries.js";
import { entryTerm } from "../../src/db/schema/entry_term.js";
import { render } from "../../src/events-and-filters/render.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  fallback,
  forTermTaxonomy,
  term,
} from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const topicPlugin = definePlugin("blog-topic", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerTermTaxonomy("topic", {
      label: "Topics",
      labels: { singular: "Topic" },
      entryTypes: ["post"],
      isHierarchical: false,
    });
  },
});

const categoryPlugin = definePlugin("blog-category", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      labels: { singular: "Category" },
      entryTypes: ["post"],
      isHierarchical: false,
    });
    ctx.registerTermTaxonomy("tag", {
      label: "Tags",
      labels: { singular: "Tag" },
      entryTypes: ["post"],
      isHierarchical: false,
    });
  },
});

const site = await testSite({
  plugins: [topicPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        term(({ data }) => (
          <section data-testid="taxonomy">
            <h1 data-testid="term-name">{data.term.name}</h1>
            <ul>
              {data.entries.map((entry: ResolvedEntry) => (
                <li key={entry.id} data-testid={`entry-${entry.slug}`}>
                  {entry.title}
                </li>
              ))}
            </ul>
          </section>
        )),
      ],
    }),
  },
});

describe("a term's archive", () => {
  test("renders the taxonomy template with the term + its entries", async () => {
    const news = await site.factory.term.create({
      taxonomy: "topic",
      slug: "news",
      name: "News",
    });
    const story = await site.factory.published.create({
      type: "post",
      slug: "story-a",
      title: "Story A",
    });
    await site.factory.entryTerm.create({
      entryId: story.id,
      termId: news.id,
      sortOrder: 0,
    });

    const page = await site.visit("/topic/news");

    page
      .assertOk()
      .assertSee('data-testid="taxonomy"')
      .assertSee('data-testid="term-name"')
      .assertSee("News")
      .assertSee("Story A");
  });

  test("excludes published entries with NULL publishedAt from the term archive", async () => {
    const author = await site.factory.user.create({ role: "admin" });
    const news = await site.factory.term.create({
      taxonomy: "topic",
      slug: "news",
      name: "News",
    });
    const kept = await site.factory.published.create({
      type: "post",
      slug: "kept",
      title: "Kept",
      authorId: author.id,
    });
    const [nullDated] = await site.context.db
      .insert(entriesTable)
      .values({
        type: "post",
        slug: "no-date",
        title: "No Date",
        content: null,
        status: "published",
        authorId: author.id,
        publishedAt: null,
      })
      .returning();
    if (!nullDated) throw new Error("insert returned no row");
    await site.factory.entryTerm.create({
      entryId: kept.id,
      termId: news.id,
      sortOrder: 0,
    });
    await site.factory.entryTerm.create({
      entryId: nullDated.id,
      termId: news.id,
      sortOrder: 1,
    });

    const page = await site.visit("/topic/news");

    page
      .assertSee('data-testid="entry-kept"')
      .assertDontSee('data-testid="entry-no-date"');
  });
});

const smallPageTaxonomy = definePlugin("small-page-tax", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerTermTaxonomy("topic", {
      label: "Topics",
      labels: { singular: "Topic" },
      entryTypes: ["post"],
      isHierarchical: false,
      archivePerPage: 3,
    });
  },
});

const smallPageSite = await testSite({
  plugins: [smallPageTaxonomy],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        term(({ data }) => (
          <span data-testid="per-page">{`perPage:${String(data.pagination.perPage)}`}</span>
        )),
      ],
    }),
  },
});

const paginationSite = await testSite({
  plugins: [topicPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        term(({ data }) => (
          <span data-testid="page">{`page:${String(data.pagination.page)};entries:${String(data.entries.length)}`}</span>
        )),
      ],
    }),
  },
});

describe("a term archive's pagination", () => {
  test("taxonomy's `archivePerPage` overrides the default page size on term archives", async () => {
    const news = await smallPageSite.factory.term.create({
      taxonomy: "topic",
      slug: "news",
      name: "News",
    });
    const post = await smallPageSite.factory.published.create({
      type: "post",
    });
    await smallPageSite.factory.entryTerm.create({
      entryId: post.id,
      termId: news.id,
      sortOrder: 0,
    });

    const page = await smallPageSite.visit("/topic/news");

    page.assertSee("perPage:3");
  });

  test("/topic/{slug}/page/2 renders page 2 of entries", async () => {
    const pageTax = await paginationSite.factory.term.create({
      taxonomy: "topic",
      slug: "page-tax",
      name: "PageTax",
    });
    const posts = await paginationSite.factory.published.createList(22, {
      type: "post",
    });
    await paginationSite.context.db.insert(entryTerm).values(
      posts.map((post, sortOrder) => ({
        entryId: post.id,
        termId: pageTax.id,
        sortOrder,
      })),
    );

    const page = await paginationSite.visit("/topic/page-tax/page/2");

    page.assertOk().assertSee("page:2;entries:2");
  });
});

const categorySite = await testSite({
  plugins: [categoryPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        forTermTaxonomy("category").template(({ data }) => (
          <div data-testid="category">{data.term.name}</div>
        )),
        forTermTaxonomy("tag").template(({ data }) => (
          <div data-testid="tag">{data.term.name}</div>
        )),
      ],
    }),
  },
});

describe("a built-in taxonomy's archive", () => {
  test("renders built-in `category` template via the category-* hierarchy", async () => {
    const biz = await categorySite.factory.term.create({
      taxonomy: "category",
      slug: "biz",
      name: "Biz",
    });
    const post = await categorySite.factory.published.create({
      type: "post",
      slug: "biz-1",
      title: "Biz 1",
    });
    await categorySite.factory.entryTerm.create({
      entryId: post.id,
      termId: biz.id,
      sortOrder: 0,
    });

    const page = await categorySite.visit("/category/biz");

    page.assertSee('data-testid="category"').assertSee("Biz");
  });

  test("built-in `tag` template via the tag-* hierarchy mirrors `category`", async () => {
    const feature = await categorySite.factory.term.create({
      taxonomy: "tag",
      slug: "feature",
      name: "Feature",
    });
    const post = await categorySite.factory.published.create({
      type: "post",
      slug: "tagged",
      title: "Tagged",
    });
    await categorySite.factory.entryTerm.create({
      entryId: post.id,
      termId: feature.id,
      sortOrder: 0,
    });

    const page = await categorySite.visit("/tag/feature");

    page.assertSee('data-testid="tag"').assertSee("Feature");
  });
});

const termFilter = definePlugin("term-filter", {
  setup: (ctx) => {
    ctx.filters.add(render.term, (data) => ({
      ...data,
      term: { ...data.term, name: "Filtered" },
    }));
  },
});

const filteredSite = await testSite({
  plugins: [topicPlugin, termFilter],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        term(({ data }) => <span data-testid="name">{data.term.name}</span>),
      ],
    }),
  },
});

describe("render.term", () => {
  test("runs its filters before the template renders", async () => {
    await filteredSite.factory.term.create({
      taxonomy: "topic",
      slug: "filtered",
      name: "Original",
    });

    const page = await filteredSite.visit("/topic/filtered");

    page.assertSee("Filtered").assertDontSee("Original");
  });
});

const eagerSite = await testSite({
  plugins: [topicPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        term(({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id}>
                <span data-testid="author">{entry.author.name}</span>
              </li>
            ))}
          </ul>
        )),
      ],
    }),
  },
});

describe("each entry in a term's archive", () => {
  test("carries its eager-loaded author + terms", async () => {
    const writer = await eagerSite.factory.user.create({
      email: "secret@example.test",
      name: "Public Writer",
      role: "admin",
    });
    const eager = await eagerSite.factory.term.create({
      taxonomy: "topic",
      slug: "eager",
      name: "Eager",
    });
    const post = await eagerSite.factory.published.create({
      type: "post",
      slug: "p",
      title: "P",
      authorId: writer.id,
    });
    await eagerSite.factory.entryTerm.create({
      entryId: post.id,
      termId: eager.id,
      sortOrder: 0,
    });

    const page = await eagerSite.visit("/topic/eager");

    page.assertSee("Public Writer").assertDontSee("secret@example.test");
  });
});
