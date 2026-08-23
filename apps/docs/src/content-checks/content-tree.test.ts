import { describe, expect, it } from "vitest";

import { FIXTURES_ROOT } from "../../test/fixtures-root";
import { readContentTree } from "./content-tree";

const pages = readContentTree(FIXTURES_ROOT);
const paths = pages.map((page) => page.path);

describe("readContentTree", () => {
  it("returns every page the Starlight loader would publish", () => {
    expect(paths).toEqual([
      "headings-in-code.mdx",
      "index.mdx",
      "markdown-page.md",
      "missing-lede-jsx.mdx",
      "missing-lede.mdx",
      "missing-sections.mdx",
      "rosters/empty.mdx",
      "rosters/field-types.mdx",
      "unparsable.mdx",
      "well-formed.mdx",
    ]);
  });

  it("skips underscore-prefixed partials, which Starlight keeps out of the collection", () => {
    expect(paths).not.toContain("_partials/note.mdx");
  });

  it("skips a file the loader would not publish", () => {
    expect(paths).not.toContain("notes.txt");
  });

  it("splits parsed frontmatter from the body", () => {
    const roster = pages.find((page) => page.path === "rosters/empty.mdx");

    expect(roster?.frontmatter).toMatchObject({
      title: "Empty Roster",
      roster: true,
    });
    expect(roster?.body.trimStart()).toMatch(
      /^A lede that stands on its own\./,
    );
  });

  it("reads a page carrying no frontmatter at all", () => {
    const bare = pages.find((page) => page.path === "markdown-page.md");

    expect(bare?.frontmatter).toEqual({});
    expect(bare?.body.trimStart()).toMatch(/^A lede that stands on its own,/);
  });
});
