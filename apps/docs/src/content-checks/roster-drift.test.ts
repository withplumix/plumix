import { describe, expect, it } from "vitest";

import type { Roster } from "./roster-drift";
import { FIXTURES_ROOT } from "../../test/fixtures-root";
import { readContentTree } from "./content-tree";
import { checkRosterDrift } from "./roster-drift";

const FIXTURE_ROSTERS: readonly Roster[] = [
  { page: "rosters/field-types.mdx", items: ["text", "textarea"] },
  {
    page: "rosters/statuses.mdx",
    items: ["draft", "published", "scheduled", "trash"],
  },
  { page: "rosters/roles.mdx", items: ["subscriber", "contributor"] },
  { page: "unparsable.mdx", items: ["text"] },
  { page: "rosters/not-written-yet.mdx", items: ["text"] },
];

const findings = checkRosterDrift(
  readContentTree(FIXTURES_ROOT),
  FIXTURE_ROSTERS,
);

function rulesFor(page: string): string[] {
  return findings
    .filter((finding) => finding.page === page)
    .map((finding) => finding.rule);
}

function messagesFor(page: string): string {
  return findings
    .filter((finding) => finding.page === page)
    .map((finding) => finding.message)
    .join("\n");
}

describe("checkRosterDrift", () => {
  it("reports an item the source lists and the page does not", () => {
    expect(rulesFor("rosters/statuses.mdx")).toEqual([
      "roster-drift/missing-item",
    ]);
  });

  it("names the item the page is short of", () => {
    expect(messagesFor("rosters/statuses.mdx")).toContain("`scheduled`");
  });

  it("reports an item the page carries and the source does not", () => {
    expect(rulesFor("rosters/roles.mdx")).toEqual([
      "roster-drift/unknown-item",
    ]);
  });

  it("names the item the page carries in excess", () => {
    expect(messagesFor("rosters/roles.mdx")).toContain("`superadmin`");
  });

  it("passes a roster page that matches its source", () => {
    expect(rulesFor("rosters/field-types.mdx")).toEqual([]);
  });

  it("leaves an unparsable page to the shape check, which already reports it", () => {
    expect(rulesFor("unparsable.mdx")).toEqual([]);
  });

  it("holds its peace over a roster page nobody has written yet", () => {
    expect(rulesFor("rosters/not-written-yet.mdx")).toEqual([]);
  });

  it("reports a roster page no entry claims, which would otherwise go unguarded", () => {
    expect(rulesFor("rosters/empty.mdx")).toEqual([
      "roster-drift/unregistered-page",
    ]);
  });

  it("reports every drifted roster in one run", () => {
    const drifted = [...new Set(findings.map((finding) => finding.page))];

    expect(drifted.sort()).toEqual([
      "rosters/empty.mdx",
      "rosters/roles.mdx",
      "rosters/statuses.mdx",
    ]);
  });
});
