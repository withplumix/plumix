import { describe, expect, test } from "vitest";

import { META_FIELD_MESSAGES } from "@plumix/core/validation";

import { META_FIELD_DESCRIPTORS } from "./meta-field-i18n.js";

// Drift in either direction silently un-translates an inline meta
// field error.
describe("meta field-message catalog mirror", () => {
  test("carries exactly the ids and source messages core emits", () => {
    const source = new Map(
      Object.values(META_FIELD_MESSAGES).map((d) => [d.id, d.message]),
    );
    const mirror = new Map(
      Object.values(META_FIELD_DESCRIPTORS).map((d) => [d.id, d.message]),
    );
    expect(mirror).toStrictEqual(source);
  });
});
