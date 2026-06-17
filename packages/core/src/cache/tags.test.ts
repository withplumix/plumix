import { describe, expect, it } from "vitest";

import { entryPurgeTags, pageTags } from "./tags.js";

describe("entryPurgeTags", () => {
  it("purges the type tag and the entry tag", () => {
    expect(entryPurgeTags("post", 42)).toEqual(["t:post", "e:42"]);
  });
});

describe("pageTags", () => {
  const base = {
    resolvedEntity: null,
    frontPageEntryTypes: () => [],
    taxonomyEntryTypes: () => [],
  };

  it("tags an entry permalink with both the type and the entry tag", () => {
    expect(
      pageTags({
        ...base,
        intent: { kind: "single", entryType: "post" },
        resolvedEntity: { kind: "entry", id: 7 },
      }),
    ).toEqual(["t:post", "e:7"]);
  });

  it("tags a type archive with the type tag", () => {
    expect(
      pageTags({ ...base, intent: { kind: "archive", entryType: "post" } }),
    ).toEqual(["t:post"]);
  });

  it("tags the front page with each listed type", () => {
    expect(
      pageTags({
        ...base,
        intent: { kind: "front-page" },
        frontPageEntryTypes: () => ["post", "note"],
      }),
    ).toEqual(["t:post", "t:note"]);
  });

  it("tags a term archive with the taxonomy's entry types", () => {
    expect(
      pageTags({
        ...base,
        intent: { kind: "taxonomy", taxonomy: "category" },
        taxonomyEntryTypes: (taxonomy) =>
          taxonomy === "category" ? ["post"] : [],
      }),
    ).toEqual(["t:post"]);
  });

  it("tags search pages with nothing", () => {
    expect(pageTags({ ...base, intent: { kind: "search" } })).toEqual([]);
  });

  it("tags nothing when a single render resolved no entry", () => {
    expect(
      pageTags({ ...base, intent: { kind: "single", entryType: "post" } }),
    ).toEqual([]);
  });
});
