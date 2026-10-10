import type { TemplateData } from "plumix";
import { describe, expect, test } from "vitest";

import type { CardTarget } from "./card-target.js";
import {
  cardIdentityFor,
  cardTargetPath,
  parseCardTargetPath,
} from "./card-target.js";

/**
 * Every fixture is a partial page: these functions read one or two fields, and
 * spelling a whole `TemplateData` would bury which ones under the rest.
 */
function page(fields: object): TemplateData {
  return { pagination: { page: 1 }, ...fields } as unknown as TemplateData;
}

const ENTRY = page({
  kind: "entry",
  entry: { id: 12, type: "post", slug: "hello" },
});
const TERM = page({
  kind: "term",
  taxonomy: "category",
  term: { id: 3, slug: "design" },
});

describe("cardIdentityFor", () => {
  test("names an entry by its id, and the node a rule matches it on", () => {
    expect(cardIdentityFor(ENTRY)).toEqual({
      kind: "entry",
      target: { kind: "entry", id: 12 },
      node: {
        kind: "entry",
        entryType: "post",
        slug: "hello",
        databaseId: 12,
      },
    });
  });

  test("names a term by its id, and the node a rule matches it on", () => {
    expect(cardIdentityFor(TERM)).toEqual({
      kind: "listing",
      page: 1,
      target: { kind: "term", id: 3 },
      node: {
        kind: "term",
        taxonomy: "category",
        slug: "design",
        databaseId: 3,
      },
    });
  });

  test("names an archive by its content type", () => {
    expect(
      cardIdentityFor(page({ kind: "entryType", contentType: "post" })),
    ).toMatchObject({
      target: { kind: "entryType", entryType: "post" },
      node: { kind: "entryType", entryType: "post" },
    });
  });

  test("names an author by their id", () => {
    expect(
      cardIdentityFor(page({ kind: "author", author: { id: 7, slug: "ada" } })),
    ).toMatchObject({
      target: { kind: "author", id: 7 },
      node: { kind: "author", slug: "ada", databaseId: 7 },
    });
  });

  test("names a date archive at the granularity it carries", () => {
    expect(
      cardIdentityFor(page({ kind: "date", year: 2026, month: 3, day: null })),
    ).toMatchObject({
      target: { kind: "date", year: 2026, month: 3, day: null },
      node: { kind: "date", year: 2026, month: 3, day: null },
    });
  });

  test("names the front page, which has one page and no target", () => {
    expect(cardIdentityFor(page({ kind: "frontPage" }))).toMatchObject({
      target: { kind: "frontPage" },
      node: { kind: "frontPage" },
    });
  });

  test("says which paginated slice of the target a listing is", () => {
    const deeper = page({
      kind: "entryType",
      contentType: "post",
      pagination: { page: 4 },
    });

    expect(cardIdentityFor(deeper)).toMatchObject({ kind: "listing", page: 4 });
  });

  test.each(["search", "archiveType", "error"])(
    "has no identity for a %s page",
    (kind) => {
      expect(cardIdentityFor(page({ kind }))).toBeNull();
    },
  );
});

describe("card target paths", () => {
  const cases: readonly (readonly [CardTarget, string])[] = [
    [{ kind: "entry", id: 12 }, "entry/12"],
    [{ kind: "term", id: 3 }, "term/3"],
    [{ kind: "author", id: 7 }, "author/7"],
    [{ kind: "entryType", entryType: "post" }, "archive/post"],
    [{ kind: "frontPage" }, "front-page"],
    [{ kind: "date", year: 2026, month: null, day: null }, "date/2026"],
    [{ kind: "date", year: 2026, month: 3, day: null }, "date/2026-03"],
    [{ kind: "date", year: 2026, month: 3, day: 4 }, "date/2026-03-04"],
    // The year is padded so the segment stays four digits, which is the only
    // width `parseCardTargetPath` reads one at.
    [{ kind: "date", year: 26, month: null, day: null }, "date/0026"],
  ];

  test.each(cases)("round-trips %o through %s", (target, path) => {
    expect(cardTargetPath(target)).toBe(path);
    expect(parseCardTargetPath(path)).toEqual(target);
  });

  test.each([
    "",
    "entry",
    "entry/0",
    "entry/-1",
    "entry/abc",
    "entry/12/extra",
    "front-page/1",
    // A URL keeps its own spelling: the page kinds are not path segments.
    "frontPage",
    "entryType/post",
    "search/cats",
    "custom/deals",
    "archive/Post",
    "archive/",
    "date/2026-3",
    "date/26",
    "date/2026-03-04-05",
    "../entry/12",
  ])("refuses %s", (path) => {
    expect(parseCardTargetPath(path)).toBeNull();
  });
});
