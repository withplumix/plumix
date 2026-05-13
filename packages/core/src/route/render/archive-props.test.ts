import { describe, expect, test } from "vitest";

import type { ArchiveProps } from "./archive-props.js";
import { isEntryArchive, isTaxonomy } from "./archive-props.js";

const entryArchive: ArchiveProps = {
  kind: "entry-archive",
  entryType: "post",
  entries: [],
};

const taxonomyArchive: ArchiveProps = {
  kind: "taxonomy",
  taxonomy: "category",
  term: { name: "News", slug: "news" },
  entries: [],
};

describe("isTaxonomy", () => {
  test("narrows a taxonomy archive", () => {
    expect(isTaxonomy(taxonomyArchive)).toBe(true);
    expect(isTaxonomy(entryArchive)).toBe(false);
  });

  test("optional name argument scopes the predicate", () => {
    expect(isTaxonomy(taxonomyArchive, "category")).toBe(true);
    expect(isTaxonomy(taxonomyArchive, "tag")).toBe(false);
    expect(isTaxonomy(entryArchive, "category")).toBe(false);
  });
});

describe("isEntryArchive", () => {
  test("narrows an entry archive", () => {
    expect(isEntryArchive(entryArchive)).toBe(true);
    expect(isEntryArchive(taxonomyArchive)).toBe(false);
  });

  test("optional entryType argument scopes the predicate", () => {
    expect(isEntryArchive(entryArchive, "post")).toBe(true);
    expect(isEntryArchive(entryArchive, "doc")).toBe(false);
    expect(isEntryArchive(taxonomyArchive, "post")).toBe(false);
  });
});
