import { describe, test } from "vitest";

import type { ResolvedEntry } from "../../src/route/contract/resolved-entry.js";
import { defineBlock } from "../../src/blocks/index.js";
import { BlockRenderer } from "../../src/blocks/renderer/index.js";
import { entries as entriesTable } from "../../src/db/schema/entries.js";
import { render } from "../../src/events-and-filters/render.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  entryType,
  fallback,
  forEntryType,
} from "../../src/route/render/template-builders.js";
import { defineTemplate } from "../../src/template.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
  },
});

const listingSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entryType(({ data }) => (
          <ul data-testid="archive">
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id} data-testid={`entry-${entry.slug}`}>
                {entry.title}
              </li>
            ))}
          </ul>
        )),
      ],
    }),
  },
});

describe("an entry type's archive", () => {
  test("renders the archive template with the seeded entries listed", async () => {
    await listingSite.factory.published.create({
      type: "post",
      slug: "first",
      title: "First",
      publishedAt: new Date("2026-05-01"),
    });
    await listingSite.factory.published.create({
      type: "post",
      slug: "second",
      title: "Second",
      publishedAt: new Date("2026-05-02"),
    });

    const page = await listingSite.visit("/post");

    page
      .assertOk()
      .assertSee('data-testid="archive"')
      .assertSee("First")
      .assertSee("Second");
  });

  test("excludes published entries with NULL publishedAt from the archive", async () => {
    const author = await listingSite.factory.user.create({ role: "admin" });
    await listingSite.factory.published.create({
      type: "post",
      slug: "kept",
      title: "Kept",
      authorId: author.id,
    });
    await listingSite.context.db.insert(entriesTable).values({
      type: "post",
      slug: "no-date",
      title: "No Date",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: null,
    });

    const page = await listingSite.visit("/post");

    page
      .assertSee('data-testid="entry-kept"')
      .assertDontSee('data-testid="entry-no-date"');
  });
});

const urlSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entryType(({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id}>{entry.url}</li>
            ))}
          </ul>
        )),
      ],
    }),
  },
});

describe("an archive's listing", () => {
  test("exposes `entry.url` to templates", async () => {
    await urlSite.factory.published.create({
      type: "post",
      slug: "alpha",
      title: "Alpha",
    });

    const page = await urlSite.visit("/post");

    page.assertSee("/post/alpha");
  });
});

const listingProbePlugin = definePlugin("acme-listing-probe", {
  setup: (ctx) => {
    ctx.registerBlock(
      defineBlock({
        name: "acme/listing-probe",
        view: () =>
          Promise.resolve({
            default: ({ loaders }) => <span>{loaders.marker}</span>,
            loaders: {
              marker: (args: { readonly attrs: Record<string, unknown> }) => {
                const tag =
                  typeof args.attrs.tag === "string" ? args.attrs.tag : "?";
                return Promise.resolve(`loaded-${tag}`);
              },
            },
          }),
      }),
    );
  },
});

const prefetchingSite = await testSite({
  plugins: [blogPlugin, listingProbePlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entryType(
          defineTemplate({
            prefetchArchiveLoaders: true,
            render: ({ data }) => (
              <ul>
                {data.entries.map((entry: ResolvedEntry) =>
                  entry.contentBlocks ? (
                    <li key={entry.id}>
                      <BlockRenderer content={entry.contentBlocks} />
                    </li>
                  ) : null,
                )}
              </ul>
            ),
          }),
        ),
      ],
    }),
  },
});

const listingProbeOffPlugin = definePlugin("acme-listing-probe-off", {
  setup: (ctx) => {
    ctx.registerBlock(
      defineBlock({
        name: "acme/listing-probe-off",
        view: () =>
          Promise.resolve({
            default: ({ loaders }) => (
              <span data-testid="probe">{loaders.marker}</span>
            ),
            loaders: { marker: () => Promise.resolve("loader-fired") },
          }),
      }),
    );
  },
});

const unprefetchedSite = await testSite({
  plugins: [blogPlugin, listingProbeOffPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entryType(({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) =>
              entry.contentBlocks ? (
                <li key={entry.id}>
                  <BlockRenderer content={entry.contentBlocks} />
                </li>
              ) : null,
            )}
          </ul>
        )),
      ],
    }),
  },
});

describe("block loaders in an archive's listing", () => {
  test("`prefetchArchiveLoaders` resolves block loaders for every entry", async () => {
    await prefetchingSite.factory.published.create({
      type: "post",
      slug: "alpha",
      title: "Alpha",
      content: {
        version: "plumix.v2",
        blocks: [
          { id: "alpha-1", name: "acme/listing-probe", attrs: { tag: "a" } },
        ],
      },
      publishedAt: new Date("2026-05-01"),
    });
    await prefetchingSite.factory.published.create({
      type: "post",
      slug: "beta",
      title: "Beta",
      content: {
        version: "plumix.v2",
        blocks: [
          { id: "beta-1", name: "acme/listing-probe", attrs: { tag: "b" } },
        ],
      },
      publishedAt: new Date("2026-05-02"),
    });

    const page = await prefetchingSite.visit("/post");

    page.assertSee("loaded-a").assertSee("loaded-b");
  });

  test("without `prefetchArchiveLoaders` they stay unresolved", async () => {
    await unprefetchedSite.factory.published.create({
      type: "post",
      slug: "gamma",
      title: "Gamma",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "g-1", name: "acme/listing-probe-off", attrs: {} }],
      },
    });

    const page = await unprefetchedSite.visit("/post");

    // Block rendered (probe testid present) but loader never fired
    // (marker text absent — `loaders.marker` was undefined at runtime).
    page.assertSee('data-testid="probe"').assertDontSee("loader-fired");
  });
});

const paginationSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entryType(({ data }) => (
          <span data-testid="pagination">
            {`page:${String(data.pagination.page)};perPage:${String(data.pagination.perPage)};total:${String(data.pagination.total)};pageCount:${String(data.pagination.pageCount)};entries:${String(data.entries.length)}`}
          </span>
        )),
      ],
    }),
  },
});

describe("an archive's pagination", () => {
  test("template receives the pagination shape { page, perPage, total, pageCount }", async () => {
    await paginationSite.factory.published.createList(2, { type: "post" });

    const page = await paginationSite.visit("/post");

    page.assertSee("page:1;perPage:20;total:2;pageCount:1");
  });

  test("/post/page/2 renders page 2 of entries", async () => {
    // ARCHIVE_LIMIT is 20, so page 2 of 25 entries has 5.
    await paginationSite.factory.published.createList(25, { type: "post" });

    const page = await paginationSite.visit("/post/page/2");

    page
      .assertOk()
      .assertSee("page:2;perPage:20;total:25;pageCount:2;entries:5");
  });
});

const smallPagePlugin = definePlugin("small-page", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
      archivePerPage: 5,
    });
  },
});

const smallPageSite = await testSite({
  plugins: [smallPagePlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entryType(({ data }) => (
          <span data-testid="per-page">{`perPage:${String(data.pagination.perPage)}`}</span>
        )),
      ],
    }),
  },
});

describe("an entry type's `archivePerPage`", () => {
  test("overrides the default page size on the archive", async () => {
    await smallPageSite.factory.published.create({ type: "post" });

    const page = await smallPageSite.visit("/post");

    page.assertSee("perPage:5");
  });
});

const specificSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => <div data-testid="index" />),
        entryType(() => <div data-testid="archive" />),
        forEntryType("post").archive.template(() => (
          <div data-testid="archive-post" />
        )),
      ],
    }),
  },
});

const indexOnlySite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(({ data }) => (
          <span data-testid="index-fallback">
            {`entries:${String("entries" in data ? data.entries.length : 0)}`}
          </span>
        )),
      ],
    }),
  },
});

describe("an archive's template", () => {
  test("archive-{type} specificity wins over `archive` and `index`", async () => {
    await specificSite.factory.published.create({ type: "post" });

    const page = await specificSite.visit("/post");

    page
      .assertSee('data-testid="archive-post"')
      .assertDontSee('data-testid="archive"');
  });

  test("falls through to `index` template when `archive` is not registered", async () => {
    await indexOnlySite.factory.published.create({ type: "post" });

    const page = await indexOnlySite.visit("/post");

    page.assertSee('data-testid="index-fallback"').assertSee("entries:1");
  });
});

const archiveFilter = definePlugin("archive-filter", {
  setup: (ctx) => {
    ctx.filters.add(render.archive, (data) => ({
      ...data,
      contentType: "filtered",
    }));
  },
});

const filteredSite = await testSite({
  plugins: [blogPlugin, archiveFilter],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entryType(({ data }) => (
          <span data-testid="ct">{data.contentType}</span>
        )),
      ],
    }),
  },
});

describe("render.archive", () => {
  test("runs its filters before the template renders", async () => {
    await filteredSite.factory.published.create({ type: "post" });

    const page = await filteredSite.visit("/post");

    page.assertSee(">filtered<");
  });
});

const eagerSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entryType(({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id} data-testid={`row-${entry.slug}`}>
                <span data-testid="author">{entry.author.name}</span>
                <span data-testid="terms">{`terms:${String(entry.terms.length)}`}</span>
              </li>
            ))}
          </ul>
        )),
      ],
    }),
  },
});

describe("each entry in an archive", () => {
  test("carries its eager-loaded author + terms", async () => {
    const writer = await eagerSite.factory.user.create({
      email: "ada@example.test",
      name: "Ada Author",
      role: "admin",
    });
    const post = await eagerSite.factory.published.create({
      type: "post",
      slug: "eager",
      title: "Eager",
      authorId: writer.id,
    });
    const tag = await eagerSite.factory.term.create({
      taxonomy: "tag",
      slug: "alpha",
      name: "Alpha",
    });
    await eagerSite.factory.entryTerm.create({
      entryId: post.id,
      termId: tag.id,
      sortOrder: 0,
    });

    const page = await eagerSite.visit("/post");

    page
      .assertSee("Ada Author")
      .assertSee("terms:1")
      .assertDontSee("ada@example.test");
  });
});
