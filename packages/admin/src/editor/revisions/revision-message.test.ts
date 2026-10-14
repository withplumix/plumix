import { describe, expect, test } from "vitest";

import { revisionMessageInput } from "./revision-message.js";

describe("revisionMessageInput", () => {
  test("saves the typed comment on its revision, trimmed", () => {
    expect(revisionMessageInput(42, "  Fixed the typo ")).toEqual({
      revisionId: 42,
      message: "Fixed the typo",
    });
  });

  test.each(["", "   "])(
    "a comment of %j clears the revision's message",
    (draft) => {
      expect(revisionMessageInput(42, draft)).toEqual({
        revisionId: 42,
        message: null,
      });
    },
  );
});
