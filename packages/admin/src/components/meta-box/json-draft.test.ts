import { describe, expect, test } from "vitest";

import { evaluateJsonDraft } from "./json-draft.js";

describe("evaluateJsonDraft", () => {
  test("blank (or whitespace-only) input clears the value", () => {
    expect(evaluateJsonDraft("")).toEqual({ kind: "empty" });
    expect(evaluateJsonDraft("   \n ")).toEqual({ kind: "empty" });
  });

  test("valid JSON parses to its value", () => {
    expect(evaluateJsonDraft('{ "a": 1 }')).toEqual({
      kind: "value",
      value: { a: 1 },
    });
    expect(evaluateJsonDraft("[true, null, 2]")).toEqual({
      kind: "value",
      value: [true, null, 2],
    });
    // A bare JSON string / number is still valid JSON.
    expect(evaluateJsonDraft('"hi"')).toEqual({ kind: "value", value: "hi" });
  });

  test("invalid JSON reports a parse error and yields no value", () => {
    // The engine's parse message is English the admin didn't choose, so the
    // result carries only the fact of the failure.
    expect(evaluateJsonDraft("{not-json")).toEqual({ kind: "error" });
  });
});
