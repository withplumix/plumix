import { describe, expect, it } from "vitest";

import type { Finding } from "./finding";
import { FIXTURES_ROOT } from "../../test/fixtures-root";
import { checkCodeSamples } from "./code-samples";
import { readContentTree } from "./content-tree";

const findings = checkCodeSamples(readContentTree(FIXTURES_ROOT));

function findingsFor(page: string): Finding[] {
  return findings.filter((finding) => finding.page === page);
}

describe("checkCodeSamples", () => {
  it("reports a sample that no longer compiles against the real types", () => {
    const rules = findingsFor("code-samples/broken.mdx").map(
      (finding) => finding.rule,
    );

    expect(rules).toEqual(["code-samples/does-not-compile"]);
  });

  it("names the block that failed and what the compiler said about it", () => {
    const reported = findingsFor("code-samples/broken.mdx")
      .map((finding) => finding.message)
      .join("\n");

    expect(reported).toContain("Sample 2");
    expect(reported).toContain("sample line 3");
    expect(reported).toContain("maxLen");
  });

  it("ignores a sample marked opt-out, which does not compile either", () => {
    expect(findingsFor("code-samples/opted-out.mdx")).toEqual([]);
  });

  it("passes a valid sample, in both `ts` and `tsx`", () => {
    expect(findingsFor("code-samples/valid.mdx")).toEqual([]);
  });

  it("leaves shell and configuration blocks alone", () => {
    expect(findingsFor("code-samples/unchecked-languages.mdx")).toEqual([]);
  });

  it("reports every offending page in one run", () => {
    const offenders = [...new Set(findings.map((finding) => finding.page))];

    expect(offenders).toEqual(["code-samples/broken.mdx"]);
  });
});
