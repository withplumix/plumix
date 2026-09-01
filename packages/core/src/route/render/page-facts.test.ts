import { describe, expect, test } from "vitest";

import type { TemplateData } from "../../theme.js";
import type {
  ArchiveData,
  AuthorArchiveData,
  CustomArchiveData,
  EntryData,
  ErrorData,
  Pagination,
  ResolvedAuthor,
  ResolvedEntry,
  ResolvedTerm,
  SearchData,
  TaxonomyData,
} from "./resolved-entry.js";
import { pageFacts } from "./page-facts.js";

const author: ResolvedAuthor = {
  id: 3,
  slug: "ada",
  name: "Ada",
  avatarUrl: null,
};

const entry = {
  publishedAt: new Date("2026-01-02T03:04:05Z"),
  updatedAt: new Date("2026-02-03T04:05:06Z"),
  author,
} as unknown as ResolvedEntry;

const term = { id: 11, slug: "news" } as unknown as ResolvedTerm;

const pagination = (page: number): Pagination => ({
  page,
  perPage: 10,
  total: 30,
  pageCount: 3,
});

describe("pageFacts", () => {
  test("an entry-type archive names the type it lists", () => {
    const data: ArchiveData = {
      kind: "archive",
      contentType: "post",
      entries: [],
      pagination: pagination(1),
    };
    expect(pageFacts(data).contentType).toBe("post");
  });

  test("no other page kind names one", () => {
    expect(pageFacts({ kind: "entry", entry }).contentType).toBeNull();
    expect(
      pageFacts({
        kind: "taxonomy",
        taxonomy: "category",
        term,
        entries: [],
        pagination: pagination(1),
      }).contentType,
    ).toBeNull();
  });

  test("an entry carries its own timestamps, author and payload", () => {
    const data: EntryData = { kind: "entry", entry };
    expect(pageFacts(data)).toEqual({
      kind: "entry",
      page: 1,
      published: new Date("2026-01-02T03:04:05Z"),
      modified: new Date("2026-02-03T04:05:06Z"),
      author,
      term: null,
      entry,
      contentType: null,
      query: null,
    });
  });

  test("an unpublished entry reports no published date", () => {
    const draft = { ...entry, publishedAt: null } as unknown as ResolvedEntry;
    const facts = pageFacts({ kind: "entry", entry: draft });
    expect(facts.published).toBeNull();
    expect(facts.modified).toEqual(new Date("2026-02-03T04:05:06Z"));
  });

  test("a term archive carries its term and pagination index", () => {
    const data: TaxonomyData = {
      kind: "taxonomy",
      taxonomy: "category",
      term,
      entries: [],
      pagination: pagination(2),
    };
    const facts = pageFacts(data);
    expect(facts.kind).toBe("taxonomy");
    expect(facts.page).toBe(2);
    expect(facts.term).toBe(term);
    expect(facts.entry).toBeNull();
    expect(facts.author).toBeNull();
  });

  test("an author archive carries its author", () => {
    const data: AuthorArchiveData = {
      kind: "author",
      author,
      entries: [],
      pagination: pagination(3),
    };
    const facts = pageFacts(data);
    expect(facts.author).toBe(author);
    expect(facts.page).toBe(3);
    expect(facts.term).toBeNull();
  });

  test("every listing kind keeps its own name and pagination index", () => {
    const listings = [
      { kind: "archive", contentType: "post" },
      { kind: "date", year: 2026, month: null, day: null },
      { kind: "frontPage" },
      { kind: "search", query: "hello" },
    ] as const;
    for (const listing of listings) {
      const data = {
        ...listing,
        entries: [],
        pagination: pagination(7),
      } as unknown as TemplateData;
      const facts = pageFacts(data);
      expect(facts.kind).toBe(listing.kind);
      expect(facts.page).toBe(7);
    }
  });

  test("an unpaginated page reports the first index", () => {
    const data: ErrorData = {
      kind: "error",
      request: new Request("https://x/"),
    };
    expect(pageFacts(data)).toEqual({
      kind: "error",
      page: 1,
      published: null,
      modified: null,
      author: null,
      term: null,
      entry: null,
      contentType: null,
      query: null,
    });
  });

  test("a custom archive's arbitrary payload is never read as another kind", () => {
    // `pagination` among them: the page an archive is on is the `page` fact it
    // states, never a listing object core would have to know the shape of.
    const data = {
      kind: "custom",
      name: "shop",
      entry,
      term,
      author,
      pagination: pagination(5),
    } as unknown as CustomArchiveData;
    expect(pageFacts(data)).toEqual({
      kind: "custom",
      page: 1,
      published: null,
      modified: null,
      author: null,
      term: null,
      entry: null,
      contentType: null,
      query: null,
    });
  });

  test("a plugin archive states the page it is on and the query it answers", () => {
    const data: CustomArchiveData = {
      kind: "custom",
      name: "search",
      page: 4,
      query: "hello",
    };
    const facts = pageFacts(data);
    expect(facts.page).toBe(4);
    expect(facts.query).toBe("hello");
  });

  test("core's search page carries its query, empty search included", () => {
    const searched = (query: string): SearchData => ({
      kind: "search",
      query,
      entries: [],
      pagination: pagination(1),
    });
    expect(pageFacts(searched("hello")).query).toBe("hello");
    expect(pageFacts(searched("")).query).toBe("");
  });
});
