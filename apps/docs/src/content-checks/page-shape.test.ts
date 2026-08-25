import { describe, expect, it } from "vitest";

import { FIXTURES_ROOT } from "../../test/fixtures-root";
import { readContentTree } from "./content-tree";
import { checkPageShape } from "./page-shape";

const findings = checkPageShape(readContentTree(FIXTURES_ROOT));

function rulesFor(file: string): string[] {
  return findings
    .filter((finding) => finding.file === file)
    .map((finding) => finding.rule);
}

describe("checkPageShape", () => {
  it("reports a page whose body opens on a multi-line import", () => {
    expect(rulesFor("missing-lede.mdx")).toEqual(["page-shape/missing-lede"]);
  });

  it("reports a page whose body opens on a JSX element", () => {
    expect(rulesFor("missing-lede-jsx.mdx")).toEqual([
      "page-shape/missing-lede",
    ]);
  });

  it("reports every mandatory section a page is short of, not just the first", () => {
    expect(rulesFor("missing-sections.mdx")).toEqual([
      "page-shape/missing-quickstart",
      "page-shape/missing-next-steps",
    ]);
  });

  it("does not count a heading inside a code fence as a section", () => {
    expect(rulesFor("headings-in-code.mdx")).toEqual([
      "page-shape/missing-overview",
      "page-shape/missing-quickstart",
      "page-shape/missing-related",
      "page-shape/missing-next-steps",
    ]);
  });

  it("checks a page the loader publishes under a non-mdx extension", () => {
    expect(rulesFor("markdown-page.md")).toEqual([
      "page-shape/missing-overview",
      "page-shape/missing-quickstart",
      "page-shape/missing-related",
      "page-shape/missing-next-steps",
    ]);
  });

  it("passes a well-formed page", () => {
    expect(rulesFor("well-formed.mdx")).toEqual([]);
  });

  it("exempts a page titled Overview from carrying a second one", () => {
    expect(rulesFor("landing/exempt.mdx")).toEqual([]);
  });

  it("still requires the overview of a page not titled Overview", () => {
    expect(rulesFor("landing/still-required.mdx")).toEqual([
      "page-shape/missing-overview",
    ]);
  });

  it("exempts a roster page from the quickstart", () => {
    expect(rulesFor("rosters/field-types.mdx")).toEqual([]);
  });

  it("withholds the exemption from a roster page that enumerates nothing", () => {
    expect(rulesFor("rosters/empty.mdx")).toEqual([
      "page-shape/missing-quickstart",
    ]);
  });

  it("skips a splash page, which is a landing page rather than a documentation page", () => {
    expect(rulesFor("index.mdx")).toEqual([]);
  });

  it("does not hold a fragment to the page template, which it has no URL to wear", () => {
    expect(rulesFor("_partials/note.mdx")).toEqual([]);
  });

  it("leaves an unparsable page to the parse check, which already reports it", () => {
    expect(rulesFor("unparsable.mdx")).toEqual([]);
  });

  it("reports every offending page in one run", () => {
    const offenders = [...new Set(findings.map((finding) => finding.file))];

    expect(offenders.sort()).toEqual([
      "headings-in-code.mdx",
      "landing/still-required.mdx",
      "markdown-page.md",
      "missing-lede-jsx.mdx",
      "missing-lede.mdx",
      "missing-sections.mdx",
      "rosters/empty.mdx",
    ]);
  });
});
