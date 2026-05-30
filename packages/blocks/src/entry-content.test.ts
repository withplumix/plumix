import { describe, expect, test } from "vitest";

import { defineEntryContent, isEntryContent } from "./entry-content.js";

describe("defineEntryContent", () => {
  test("produces an envelope that the isEntryContent guard accepts", () => {
    const content = defineEntryContent([
      { id: "h", name: "core/heading", attrs: { text: "Hi" } },
    ]);
    expect(isEntryContent(content)).toBe(true);
  });
});
