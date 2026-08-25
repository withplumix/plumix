import { describe, expect, it } from "vitest";

import { FIXTURES_ROOT } from "../../test/fixtures-root";
import { readContentTree } from "./content-tree";

const files = readContentTree(FIXTURES_ROOT);
const paths = files.map((file) => file.path);

function kindOf(path: string): string | undefined {
  return files.find((file) => file.path === path)?.kind;
}

describe("readContentTree", () => {
  it("returns every file the markdown pipeline processes", () => {
    expect(paths).toEqual([
      "_partials/broken-sample.mdx",
      "_partials/note.mdx",
      "_partials/roster-items.mdx",
      "_partials/unparsable.mdx",
      "code-samples/_snippet.mdx",
      "code-samples/broken.mdx",
      "code-samples/opted-out.mdx",
      "code-samples/unchecked-languages.mdx",
      "code-samples/valid.mdx",
      "headings-in-code.mdx",
      "index.mdx",
      "landing/exempt.mdx",
      "landing/still-required.mdx",
      "legacy-note.markdown",
      "markdown-page.md",
      "missing-lede-jsx.mdx",
      "missing-lede.mdx",
      "missing-sections.mdx",
      "rosters/empty.mdx",
      "rosters/field-types.mdx",
      "rosters/roles.mdx",
      "rosters/statuses.mdx",
      "unparsable.mdx",
      "well-formed.mdx",
    ]);
  });

  it("carries a file the Starlight loader publishes as a page", () => {
    expect(kindOf("well-formed.mdx")).toBe("page");
  });

  it("marks a file under an underscore-prefixed directory a fragment", () => {
    expect(kindOf("_partials/note.mdx")).toBe("fragment");
  });

  it("marks an underscore-prefixed file a fragment, wherever it sits", () => {
    expect(kindOf("code-samples/_snippet.mdx")).toBe("fragment");
  });

  it("marks a file the collection glob would not publish a fragment", () => {
    expect(kindOf("legacy-note.markdown")).toBe("fragment");
  });

  it("skips a file the markdown pipeline would not process", () => {
    expect(paths).not.toContain("notes.txt");
  });

  it("splits parsed frontmatter from the body", () => {
    const roster = files.find((file) => file.path === "rosters/empty.mdx");

    expect(roster?.frontmatter).toMatchObject({
      title: "Empty Roster",
      roster: true,
    });
    expect(roster?.body.trimStart()).toMatch(
      /^A lede that stands on its own\./,
    );
  });

  it("reads a page carrying no frontmatter at all", () => {
    const bare = files.find((file) => file.path === "markdown-page.md");

    expect(bare?.frontmatter).toEqual({});
    expect(bare?.body.trimStart()).toMatch(/^A lede that stands on its own,/);
  });
});
