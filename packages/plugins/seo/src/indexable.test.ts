import type { PageFacts, ResolvedEntry, ResolvedTerm } from "plumix";
import { describe, expect, test } from "vitest";

import type { SeoSettings } from "./settings.js";
import { indexable } from "./indexable.js";
import { SEO_META_KEYS } from "./overrides.js";

const entryOf = (type: string, meta: Record<string, unknown> = {}) =>
  ({ type, meta }) as unknown as ResolvedEntry;

const termOf = (taxonomy: string, meta: Record<string, unknown> = {}) =>
  ({ taxonomy, meta }) as unknown as ResolvedTerm;

const facts = (overrides: Partial<PageFacts> = {}): PageFacts => ({
  kind: "entry",
  page: 1,
  published: null,
  modified: null,
  author: null,
  term: null,
  entry: entryOf("post"),
  contentType: null,
  query: null,
  ...overrides,
});

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

describe("the assertion chain, arm by arm", () => {
  test("site_private — a private site holds every page out", () => {
    for (const kind of ["entry", "search", "frontPage", "error"] as const) {
      expect(
        indexable(facts({ kind }), settings({ indexable: false })),
      ).toEqual({ indexable: false, reason: "site_private" });
    }
  });

  test("entry_override — an entry or term marked noindex", () => {
    const entry = entryOf("post", { [SEO_META_KEYS.noindex]: true });
    expect(indexable(facts({ entry }), settings())).toEqual({
      indexable: false,
      reason: "entry_override",
    });

    const term = termOf("category", { [SEO_META_KEYS.noindex]: true });
    expect(
      indexable(facts({ kind: "taxonomy", entry: null, term }), settings()),
    ).toEqual({ indexable: false, reason: "entry_override" });
  });

  test("type_default — a whole entry type held out, on its entries", () => {
    expect(
      indexable(facts(), settings({ noindexTypes: new Set(["post"]) })),
    ).toEqual({ indexable: false, reason: "type_default" });
  });

  test("type_default — and on that type's own archive", () => {
    expect(
      indexable(
        facts({ kind: "archive", entry: null, contentType: "post" }),
        settings({ noindexTypes: new Set(["post"]) }),
      ),
    ).toEqual({ indexable: false, reason: "type_default" });
  });

  test("type_default — another type is unaffected", () => {
    expect(
      indexable(
        facts({ entry: entryOf("page") }),
        settings({ noindexTypes: new Set(["post"]) }),
      ).reason,
    ).toBe("default");
  });

  test("taxonomy_default — a whole taxonomy's archives held out", () => {
    expect(
      indexable(
        facts({ kind: "taxonomy", entry: null, term: termOf("tag") }),
        settings({ noindexTaxonomies: new Set(["tag"]) }),
      ),
    ).toEqual({ indexable: false, reason: "taxonomy_default" });
  });

  test("search_results — thin by default, indexable on request", () => {
    const search = facts({ kind: "search", entry: null, query: "hello" });
    expect(indexable(search, settings())).toEqual({
      indexable: false,
      reason: "search_results",
    });
    expect(indexable(search, settings({ indexSearch: true })).reason).toBe(
      "default",
    );
  });

  test("search_results — a plugin archive answering a query is one too", () => {
    const archive = facts({ kind: "custom", entry: null, query: "hello" });
    expect(indexable(archive, settings())).toEqual({
      indexable: false,
      reason: "search_results",
    });
    expect(indexable(archive, settings({ indexSearch: true })).reason).toBe(
      "default",
    );
  });

  test("search_results — a plugin archive that answers none is untouched", () => {
    expect(
      indexable(facts({ kind: "custom", entry: null }), settings()).reason,
    ).toBe("default");
  });

  test("paginated — page two and beyond, by default", () => {
    const page2 = facts({ kind: "archive", entry: null, page: 2 });
    expect(indexable(page2, settings())).toEqual({
      indexable: false,
      reason: "paginated",
    });
    expect(indexable(page2, settings({ indexPaginated: true })).reason).toBe(
      "default",
    );
    expect(
      indexable(facts({ kind: "archive", entry: null, page: 1 }), settings())
        .reason,
    ).toBe("default");
  });

  test("not_found — an error page, by default", () => {
    const missing = facts({ kind: "error", entry: null });
    expect(indexable(missing, settings())).toEqual({
      indexable: false,
      reason: "not_found",
    });
    expect(indexable(missing, settings({ indexNotFound: true })).reason).toBe(
      "default",
    );
  });

  test("default — an ordinary entry on an ordinary site", () => {
    expect(indexable(facts(), settings())).toEqual({
      indexable: true,
      reason: "default",
    });
  });
});

describe("the chain short-circuits in its documented order", () => {
  // Each case fires every arm at once and asserts the earliest one answers.
  const everything = settings({
    indexable: false,
    noindexTypes: new Set(["post"]),
    noindexTaxonomies: new Set(["category"]),
  });
  const loaded = facts({
    kind: "search",
    query: "hello",
    page: 3,
    entry: entryOf("post", { [SEO_META_KEYS.noindex]: true }),
    term: termOf("category"),
    contentType: "post",
  });

  test("site_private outranks everything below it", () => {
    expect(indexable(loaded, everything).reason).toBe("site_private");
  });

  test("entry_override outranks the type default", () => {
    expect(
      indexable(loaded, settings({ ...everything, indexable: true })).reason,
    ).toBe("entry_override");
  });

  test("type_default outranks the taxonomy default", () => {
    expect(
      indexable(
        { ...loaded, entry: entryOf("post") },
        settings({ ...everything, indexable: true }),
      ).reason,
    ).toBe("type_default");
  });

  test("taxonomy_default outranks the search arm", () => {
    expect(
      indexable(
        { ...loaded, entry: null, contentType: null },
        settings({ ...everything, indexable: true, noindexTypes: new Set() }),
      ).reason,
    ).toBe("taxonomy_default");
  });

  test("search_results outranks the paginated arm", () => {
    expect(
      indexable(
        { ...loaded, entry: null, term: null, contentType: null },
        settings({
          ...everything,
          indexable: true,
          noindexTypes: new Set(),
          noindexTaxonomies: new Set(),
        }),
      ).reason,
    ).toBe("search_results");
  });

  test("paginated outranks the not-found arm", () => {
    expect(
      indexable(
        {
          ...loaded,
          kind: "error",
          query: null,
          entry: null,
          term: null,
          contentType: null,
        },
        settings({
          ...everything,
          indexable: true,
          noindexTypes: new Set(),
          noindexTaxonomies: new Set(),
        }),
      ).reason,
    ).toBe("paginated");
  });
});
