import { describe, expect, test } from "vitest";

import type { TemplateData, TierMatchRule } from "../../theme.js";
import type { ResolvedEntry, ResolvedTerm } from "./resolved-entry.js";
import { text } from "../../plugin/fields/builder.js";
import {
  archiveTypeTargets,
  authorTargets,
  dateTargets,
  entryTypeMatch,
  entryTypeTargets,
  metaEquals,
  termMetaEquals,
  termTaxonomyMatch,
  termTaxonomyTargets,
} from "./rule-selectors.js";

// A rule kind that is neither of the two in the repo: its selector keeps the
// selected match and carries no payload at all. What these tests read is the
// vocabulary the constructors publish, rather than what a template or a card
// happens to do with it — the contract a third-party rule kind builds against.
interface Probe {
  readonly selected: TierMatchRule;
}

const probe = (where: TierMatchRule): Probe => ({ selected: where });

interface Widget extends ResolvedEntry {
  readonly sku: string;
}
interface Colour extends ResolvedTerm {
  readonly hex: string;
}
declare module "../../template-registry.js" {
  interface EntryTypeRegistry {
    widget: { entry: Widget };
  }
  interface TermTaxonomyRegistry {
    colour: { term: Colour };
  }
  interface ArchiveTypeRegistry {
    lookbook: { data: { kind: "custom"; name: "lookbook" } };
  }
}

const _widgetFields = [text("size")];
const _colourFields = [text("family")];
declare module "../../plugin/fields/contributions.js" {
  interface EntryMetaContributions {
    widgetBox: { entryTypes: "widget"; fields: typeof _widgetFields };
  }
  interface TermMetaContributions {
    colourBox: { termTaxonomies: "colour"; fields: typeof _colourFields };
  }
}

describe("entryTypeTargets", () => {
  const widget = entryTypeTargets("widget", probe, probe);

  test("the bare selector matches every entry of the type", () => {
    expect(widget.selected).toEqual({
      match: { nodeKind: "content", type: "widget" },
    });
  });

  test("slug and id narrow the content match", () => {
    expect(widget.slug("a").selected.match).toEqual({
      nodeKind: "content",
      type: "widget",
      slug: "a",
    });
    expect(widget.id(3).selected.match).toEqual({
      nodeKind: "content",
      type: "widget",
      id: 3,
    });
  });

  test("where and whereMeta narrow by predicate, keeping the identity", () => {
    for (const narrowed of [
      widget.where(() => true),
      widget.whereMeta("size", "large"),
    ]) {
      const match = narrowed.selected.match;
      expect(match?.nodeKind).toBe("content");
      expect(match?.type).toBe("widget");
      expect(typeof match?.predicate).toBe("function");
    }
  });

  test("archive selects the content-type-archive node, not the content one", () => {
    expect(widget.archive.selected).toEqual({
      match: { nodeKind: "content-type-archive", type: "widget" },
    });
  });

  // `named` is one half of a contract with the editor's template picker, so it
  // is minted by the template builders rather than here. A rule kind with no
  // picker behind it must not receive it by default.
  test("no named narrowing reaches a rule kind that did not ask for one", () => {
    expect("named" in widget).toBe(false);
  });
});

describe("termTaxonomyTargets", () => {
  const colour = termTaxonomyTargets("colour", probe);

  test("the bare selector matches every term of the taxonomy", () => {
    expect(colour.selected).toEqual({
      match: { nodeKind: "term", type: "colour" },
    });
  });

  test("slug and id narrow the term match", () => {
    expect(colour.slug("red").selected.match).toMatchObject({
      nodeKind: "term",
      type: "colour",
      slug: "red",
    });
    expect(colour.id(9).selected.match).toMatchObject({ id: 9 });
  });

  test("where and whereMeta narrow by predicate", () => {
    expect(typeof colour.where(() => true).selected.match?.predicate).toBe(
      "function",
    );
    expect(
      typeof colour.whereMeta("family", "warm").selected.match?.predicate,
    ).toBe("function");
  });

  test("no named narrowing reaches a rule kind that did not ask for one", () => {
    expect("named" in colour).toBe(false);
  });
});

describe("authorTargets", () => {
  const authors = authorTargets(probe);

  test("carries the fixed author type, narrowed by slug or id", () => {
    expect(authors.selected.match).toEqual({
      nodeKind: "author",
      type: "author",
    });
    expect(authors.slug("ada").selected.match).toMatchObject({ slug: "ada" });
    expect(authors.id(1).selected.match).toMatchObject({ id: 1 });
  });
});

describe("dateTargets", () => {
  const forDate = dateTargets(probe);

  // `matchesIdentity` compares `match.month ?? null` against the node's, so an
  // unset component has to be absent rather than present-and-undefined: a year
  // matcher that carried `month: undefined` would still read as unset, but one
  // that carried `month: null` or a key set from a spread would not.
  test("an unset component is absent from the match, not undefined", () => {
    const year = forDate(2026).selected.match;
    expect(year).toEqual({ nodeKind: "date", type: "date", year: 2026 });
    expect(Object.keys(year ?? {})).not.toContain("month");
    expect(Object.keys(year ?? {})).not.toContain("day");
  });

  test("each granularity mints exactly the components it was given", () => {
    expect(forDate(2026, 7).selected.match).toEqual({
      nodeKind: "date",
      type: "date",
      year: 2026,
      month: 7,
    });
    expect(forDate(2026, 7, 21).selected.match).toEqual({
      nodeKind: "date",
      type: "date",
      year: 2026,
      month: 7,
      day: 21,
    });
  });
});

describe("archiveTypeTargets", () => {
  test("carries the archive-type name as the custom node's type", () => {
    expect(archiveTypeTargets("lookbook", probe).selected).toEqual({
      match: { nodeKind: "custom", type: "lookbook" },
    });
  });
});

// The pieces a rule kind mints a narrowing of its own from, once the five
// constructors above have run out. They are public for that, so what they mint
// is a contract rather than an implementation detail of `named`.
describe("the match constructors", () => {
  test("entryTypeMatch is the prefix a bare entry-type selector carries", () => {
    expect(entryTypeMatch("widget")).toEqual(
      entryTypeTargets("widget", probe, probe).selected,
    );
    expect(entryTypeMatch("widget", { slug: "a" }).match).toMatchObject({
      slug: "a",
    });
  });

  test("termTaxonomyMatch is the prefix a bare taxonomy selector carries", () => {
    expect(termTaxonomyMatch("colour")).toEqual(
      termTaxonomyTargets("colour", probe).selected,
    );
    expect(termTaxonomyMatch("colour", { id: 9 }).match).toMatchObject({
      id: 9,
    });
  });

  test("what they refuse to compile", () => {
    // @ts-expect-error - an unregistered name, which would mint a rule that
    // never matches.
    entryTypeMatch("nope");
    // @ts-expect-error - same, one node kind over.
    termTaxonomyMatch("nope");
    // @ts-expect-error - the prefix is the whole point; overriding it is
    // writing the matcher by hand.
    entryTypeMatch("widget", { nodeKind: "term" });
  });
});

// Both read the meta the resolved data carries, so a fixture is that bag —
// `entry.meta` decoded and reference-hydrated, `term.meta` as the term row
// carries it.
const entryData = (meta: Record<string, unknown>) =>
  ({ entry: { meta } }) as unknown as TemplateData;
const termData = (meta: Record<string, unknown>) =>
  ({ term: { meta } }) as unknown as TemplateData;

describe("metaEquals", () => {
  const winter = metaEquals("season", "winter");

  test("matches only when the meta value is equal", () => {
    expect(winter(entryData({ season: "winter" }))).toBe(true);
    expect(winter(entryData({ season: "summer" }))).toBe(false);
  });

  // The walk hands a predicate whatever the resolved node carries, so one
  // written for entries has to refuse a term rather than read a key off it.
  test("refuses data that is not an entry", () => {
    expect(winter(termData({ season: "winter" }))).toBe(false);
  });
});

describe("termMetaEquals", () => {
  const regional = termMetaEquals("scope", "regional");

  test("matches only when the term-meta value is equal", () => {
    expect(regional(termData({ scope: "regional" }))).toBe(true);
    expect(regional(termData({ scope: "national" }))).toBe(false);
  });

  test("refuses data that is not a term", () => {
    expect(regional(entryData({ scope: "regional" }))).toBe(false);
  });
});
