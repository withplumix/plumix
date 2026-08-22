import { describe, expect, it } from "vitest";

import { FIXTURES_ROOT } from "../../test/fixtures-root";
import { readContentTree } from "./content-tree";
import { CONTENT_ROOT, runContentChecks } from "./index";

describe("runContentChecks", () => {
  it("runs the checks against an arbitrary content root", () => {
    const rules = runContentChecks(FIXTURES_ROOT).map(
      (finding) => finding.rule,
    );

    expect(rules).toContain("page-shape/missing-lede");
  });

  it("reaches the real content tree", () => {
    // Without this the clean run below would pass just as happily on a
    // traversal that found nothing.
    expect(readContentTree(CONTENT_ROOT).length).toBeGreaterThan(0);
  });

  it("passes the real content tree", () => {
    expect(runContentChecks(CONTENT_ROOT)).toEqual([]);
  });
});
