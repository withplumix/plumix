import { describe, expect, test } from "vitest";

import { VALIDATION_DESCRIPTORS } from "@plumix/core/validation";

import { CORE_VALIDATION_DESCRIPTORS } from "./core-validation-i18n.js";

// Drift in either direction silently un-translates an admin form message.
describe("core validation catalog mirror", () => {
  test("carries exactly the ids and source messages core emits", () => {
    const source = new Map(
      Object.values(VALIDATION_DESCRIPTORS).map((d) => [d.id, d.message]),
    );
    const mirror = new Map(
      Object.values(CORE_VALIDATION_DESCRIPTORS).map((d) => [d.id, d.message]),
    );
    expect(mirror).toStrictEqual(source);
  });
});
