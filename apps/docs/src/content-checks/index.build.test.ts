import { describe, expect, it } from "vitest";

import { FIXTURES_ROOT } from "../../test/fixtures-root";
import { readContentTree } from "./content-tree";
import { CONTENT_ROOT, runContentChecks } from "./index";

const findings = runContentChecks(FIXTURES_ROOT);

describe("runContentChecks", () => {
  it("runs the checks against an arbitrary content root", () => {
    const rules = findings.map((finding) => finding.rule);

    expect(rules).toContain("page-shape/missing-lede");
    expect(rules).toContain("code-samples/does-not-compile");
  });

  it("runs every check over the one traversal", () => {
    const rules = runContentChecks(FIXTURES_ROOT, [
      { page: "rosters/roles.mdx", items: ["subscriber", "contributor"] },
    ]).map((finding) => finding.rule);

    expect(rules).toContain("roster-drift/unknown-item");
  });

  it("reports a sample that only a partial carries", () => {
    const rules = findings.flatMap((finding) =>
      finding.file === "_partials/broken-sample.mdx" ? [finding.rule] : [],
    );

    expect(rules).toEqual(["code-samples/does-not-compile"]);
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
