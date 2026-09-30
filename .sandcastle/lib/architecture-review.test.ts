import { describe, expect, test } from "vitest";

import {
  issueBody,
  marketplaceLocation,
  readReviewResult,
  upstreamSection,
} from "./architecture-review.js";

const skill = `# Improve Codebase Architecture

## Process

### 1. Explore

Scope before you scan.

Apply the **deletion test**.

### 2. Present candidates as an HTML report

Write a self-contained HTML file.
`;

describe("upstreamSection", () => {
  test("is the named section up to the next heading of the same depth", () => {
    expect(upstreamSection(skill, "### 1. Explore")).toBe(
      "### 1. Explore\n\nScope before you scan.\n\nApply the **deletion test**.",
    );
  });

  test("throws naming the heading when upstream no longer has it", () => {
    expect(() => upstreamSection(skill, "### 1. Scan")).toThrow(
      '"### 1. Scan"',
    );
  });
});

describe("readReviewResult", () => {
  test("a proposal is its title and its report", () => {
    expect(
      readReviewResult(
        "Ranked four candidates.\n\n<title>merge the permalink builders behind one module</title>\n\n<report>\n## Architecture review\n\nBody.\n</report>\n",
      ),
    ).toEqual({
      status: "proposed",
      title: "merge the permalink builders behind one module",
      report: "## Architecture review\n\nBody.",
    });
  });

  test("a skip is its reason", () => {
    expect(
      readReviewResult(
        "<skipped>Every candidate is covered: #2457 owns core's layering.</skipped>",
      ),
    ).toEqual({
      status: "skipped",
      reason: "Every candidate is covered: #2457 owns core's layering.",
    });
  });

  test("reads the closing blocks, not a tag named earlier in the agent's prose", () => {
    expect(
      readReviewResult(
        "Next I emit the <title> and <report> blocks.\n\n<title>one owner for the media list query</title>\n<report>Body.</report>",
      ),
    ).toEqual({
      status: "proposed",
      title: "one owner for the media list query",
      report: "Body.",
    });
  });

  test("is null when the run ended without a result", () => {
    expect(readReviewResult("I ran out of context.")).toBeNull();
  });
});

describe("marketplaceLocation", () => {
  const listed = JSON.stringify([
    {
      name: "sentry-skills",
      source: "github",
      installLocation: "/home/agent/.claude/plugins/marketplaces/sentry-skills",
    },
    {
      name: "mattpocock",
      source: "directory",
      installLocation: "/home/agent/.mattpocock-skills",
    },
  ]);

  test("is where the named marketplace is checked out", () => {
    expect(marketplaceLocation(listed, "mattpocock")).toBe(
      "/home/agent/.mattpocock-skills",
    );
  });

  test("throws pointing at the install script when it is missing", () => {
    expect(() => marketplaceLocation("[]", "mattpocock")).toThrow(
      "install-mattpocock-skills.sh",
    );
  });
});

describe("issueBody", () => {
  test("is the report, then how to take it forward or decline it", () => {
    const body = issueBody("## Architecture review\n\nBody.");
    expect(body.startsWith("## Architecture review\n\nBody.\n\n---\n")).toBe(
      true,
    );
    expect(body).toContain("/grill-with-docs");
    expect(body).toContain("close it with the reason");
  });
});
