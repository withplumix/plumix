import { describe, expect, test } from "vitest";

import { blockersNamedIn } from "./named-blockers.js";

describe("blockersNamedIn", () => {
  test("reads the pull request a brief says it is blocked by", () => {
    expect(blockersNamedIn("Part of #2722. Blocked by #2719.")).toEqual([2719]);
  });

  test("reads every number in a list", () => {
    expect(
      blockersNamedIn("Blocked by #2609, #2610 and #2611.\nblocked by #2700"),
    ).toEqual([2609, 2610, 2611, 2700]);
  });

  test("ignores numbers that are not named as blockers", () => {
    expect(blockersNamedIn("Part of #2722. Refs #2719. Fixes #12.")).toEqual(
      [],
    );
  });
});
