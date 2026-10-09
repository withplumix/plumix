import { describe, expect, it } from "vitest";

import { pageReads } from "./tags.js";

describe("pageReads", () => {
  const base = { resolvedEntity: null, frontPageEntryTypes: () => [] };

  it("reads an entry permalink's type and the entry itself", () => {
    expect(
      pageReads({
        ...base,
        intent: { kind: "entry", entryType: "post" },
        resolvedEntity: { kind: "entry", id: 7, preview: false },
      }),
    ).toEqual([
      { kind: "entryType", type: "post" },
      { kind: "entry", id: 7 },
    ]);
  });

  it("reads a type archive's type", () => {
    expect(
      pageReads({ ...base, intent: { kind: "entryType", entryType: "post" } }),
    ).toEqual([{ kind: "entryType", type: "post" }]);
  });

  it("reads each type the front page lists", () => {
    expect(
      pageReads({
        ...base,
        intent: { kind: "frontPage" },
        frontPageEntryTypes: () => ["post", "note"],
      }),
    ).toEqual([
      { kind: "entryType", type: "post" },
      { kind: "entryType", type: "note" },
    ]);
  });

  it("reads a term archive's taxonomy", () => {
    expect(
      pageReads({ ...base, intent: { kind: "term", taxonomy: "category" } }),
    ).toEqual([{ kind: "taxonomy", taxonomy: "category" }]);
  });

  it("reads nothing for a search page", () => {
    expect(pageReads({ ...base, intent: { kind: "search" } })).toEqual([]);
  });

  it("reads nothing when a single render resolved no entry", () => {
    expect(
      pageReads({ ...base, intent: { kind: "entry", entryType: "post" } }),
    ).toEqual([]);
  });
});
