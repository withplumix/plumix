import type {
  PageFacts,
  Pagination,
  ResolvedAuthor,
  ResolvedEntry,
  ResolvedTerm,
  TemplateData,
} from "plumix";
import { describe, expect, test } from "vitest";

import type { SeoSettings } from "./settings.js";
import { patternTitle, titleVariables } from "./page-title.js";

const pagination = (total: number): Pagination => ({
  page: 1,
  perPage: 10,
  total,
  pageCount: 1,
});

const author: ResolvedAuthor = {
  id: 1,
  slug: "ada",
  name: "Ada Lovelace",
  avatarUrl: null,
};

const entry = {
  type: "post",
  publishedAt: new Date("2026-07-02T00:00:00Z"),
  updatedAt: new Date("2026-07-02T00:00:00Z"),
  author,
  meta: {},
} as unknown as ResolvedEntry;

const term = { name: "News", taxonomy: "category" } as unknown as ResolvedTerm;

const facts = (overrides: Partial<PageFacts>): PageFacts => ({
  kind: "entry",
  page: 1,
  published: null,
  modified: null,
  author: null,
  term: null,
  entry: null,
  contentType: null,
  query: null,
  ...overrides,
});

function read(data: TemplateData, page: Partial<PageFacts>): typeof result {
  const result = titleVariables({
    facts: facts({ kind: data.kind, ...page }),
    data,
    title: "Hello",
    siteName: "Demo",
    separator: "·",
    localeCode: "en",
  });
  return result;
}

describe("titleVariables", () => {
  test("an entry carries its title, author and published date", () => {
    const vars = read(
      { kind: "entry", entry },
      { entry, author, published: entry.publishedAt },
    );

    expect(vars.title).toBe("Hello");
    expect(vars.sitename).toBe("Demo");
    expect(vars.sep).toBe("·");
    expect(vars.author).toBe("Ada Lovelace");
    expect(vars.date).toBe("July 2, 2026");
    expect(vars.term).toBe("");
    expect(vars.searchphrase).toBe("");
  });

  test("an entry-type archive carries its result count", () => {
    const vars = read(
      {
        kind: "archive",
        contentType: "post",
        entries: [],
        pagination: pagination(42),
      },
      { contentType: "post" },
    );

    expect(vars.count).toBe("42");
    expect(vars.date).toBe("");
  });

  test("a term archive carries its term name", () => {
    const vars = read(
      {
        kind: "taxonomy",
        taxonomy: "category",
        term,
        entries: [],
        pagination: pagination(7),
      },
      { term },
    );

    expect(vars.term).toBe("News");
    expect(vars.count).toBe("7");
  });

  test("an author archive carries the author", () => {
    const vars = read(
      { kind: "author", author, entries: [], pagination: pagination(3) },
      { author },
    );

    expect(vars.author).toBe("Ada Lovelace");
    expect(vars.count).toBe("3");
  });

  test("an author with no display name falls back to the slug", () => {
    const anonymous = { ...author, name: null };
    const vars = read(
      {
        kind: "author",
        author: anonymous,
        entries: [],
        pagination: pagination(1),
      },
      { author: anonymous },
    );

    expect(vars.author).toBe("ada");
  });

  test("a date archive carries the period it covers, at its own precision", () => {
    const period = (
      year: number,
      month: number | null,
      day: number | null,
    ): string =>
      read(
        {
          kind: "date",
          year,
          month,
          day,
          entries: [],
          pagination: pagination(1),
        },
        {},
      ).date;

    expect(period(2026, null, null)).toBe("2026");
    expect(period(2026, 7, null)).toBe("July 2026");
    expect(period(2026, 7, 2)).toBe("July 2, 2026");
  });

  test("a search page carries its query and result count", () => {
    const vars = read(
      {
        kind: "search",
        query: "dough",
        entries: [],
        pagination: pagination(12),
      },
      {},
    );

    expect(vars.searchphrase).toBe("dough");
    expect(vars.count).toBe("12");
  });

  test("a page that lists nothing has no count", () => {
    expect(read({ kind: "custom", name: "events" }, {}).count).toBe("");
  });

  test("a missing site name is empty, not the string null", () => {
    const vars = titleVariables({
      facts: facts({ kind: "entry", entry }),
      data: { kind: "entry", entry },
      title: "Hello",
      siteName: null,
      separator: "·",
      localeCode: "en",
    });

    expect(vars.sitename).toBe("");
  });
});

describe("patternTitle", () => {
  const settings = (overrides: Partial<SeoSettings> = {}): SeoSettings => ({
    indexable: true,
    defaultOgImage: null,
    represents: "organization",
    separator: "·",
    titlePattern: null,
    typeTitlePatterns: new Map(),
    noindexTypes: new Set(),
    noindexTaxonomies: new Set(),
    indexSearch: false,
    indexPaginated: false,
    indexNotFound: false,
    blockAiCrawlers: false,
    indexNowKey: null,
    ...overrides,
  });

  const compose = (
    config: SeoSettings,
    page: Partial<PageFacts> = { entry },
    data: TemplateData = { kind: "entry", entry },
  ): string | null =>
    patternTitle(config, {
      facts: facts({ kind: data.kind, ...page }),
      data,
      title: "Hello",
      siteName: "Demo",
      localeCode: "en",
    });

  test("a type's own pattern outranks the site-wide one", () => {
    expect(
      compose(
        settings({
          titlePattern: "%%title%% %%sep%% site-wide",
          typeTitlePatterns: new Map([["post", "%%title%% %%sep%% per-type"]]),
        }),
      ),
    ).toBe("Hello · per-type");
  });

  test("a type with no pattern of its own falls to the site-wide one", () => {
    expect(
      compose(
        settings({
          titlePattern: "%%title%% %%sep%% site-wide",
          typeTitlePatterns: new Map([["page", "never"]]),
        }),
      ),
    ).toBe("Hello · site-wide");
  });

  test("an archive is covered by the pattern of the type it lists", () => {
    const archive: TemplateData = {
      kind: "archive",
      contentType: "post",
      entries: [],
      pagination: pagination(0),
    };
    expect(
      compose(
        settings({ typeTitlePatterns: new Map([["post", "All %%title%%"]]) }),
        { entry: null, contentType: "post" },
        archive,
      ),
    ).toBe("All Hello");
  });

  test("no pattern anywhere composes nothing", () => {
    expect(compose(settings())).toBeNull();
  });
});
