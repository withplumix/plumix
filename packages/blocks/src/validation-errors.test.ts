import { describe, expect, test } from "vitest";

import { BlockContentValidationError } from "./validation-errors.js";

const ISSUE = {
  code: "unknown_block_type",
  message: 'Unknown block type "acme/never"',
  path: "$.content[0]",
  nodeName: "acme/never",
} as const;

describe("BlockContentValidationError", () => {
  test("fromIssues wraps the validator output", () => {
    const err = BlockContentValidationError.fromIssues([ISSUE]);
    expect(err).toBeInstanceOf(BlockContentValidationError);
    expect(err.issues).toEqual([ISSUE]);
  });

  test("name survives serialization (static {} regression guard)", () => {
    const err = BlockContentValidationError.fromIssues([ISSUE]);
    expect(err.name).toBe("BlockContentValidationError");
  });

  test("fromResult wraps a failing validator result", () => {
    const err = BlockContentValidationError.fromResult({
      ok: false,
      errors: [ISSUE],
    });
    expect(err.issues).toEqual([ISSUE]);
  });
});
