import { describe, expect, it } from "vitest";

import { FIXTURES_ROOT } from "../../test/fixtures-root";
import { readContentTree } from "./content-tree";
import { checkParsable } from "./parsable";

const findings = checkParsable(readContentTree(FIXTURES_ROOT));

function rulesFor(file: string): string[] {
  return findings
    .filter((finding) => finding.file === file)
    .map((finding) => finding.rule);
}

describe("checkParsable", () => {
  it("reports a page whose body is not MDX", () => {
    expect(rulesFor("unparsable.mdx")).toEqual(["parsable/not-mdx"]);
  });

  it("reports a fragment too, which no page check would have looked at", () => {
    expect(rulesFor("_partials/unparsable.mdx")).toEqual(["parsable/not-mdx"]);
  });

  it("reports every unreadable file in one run", () => {
    const offenders = findings.map((finding) => finding.file);

    expect(offenders.sort()).toEqual([
      "_partials/unparsable.mdx",
      "unparsable.mdx",
    ]);
  });
});
