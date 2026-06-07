import { describe, expect, test } from "vitest";

import { SITE_SETTINGS_DESCRIPTORS } from "@plumix/core/i18n";

import { CORE_SETTINGS_DESCRIPTORS } from "./core-settings-i18n.js";

// Drift in either direction silently un-translates a core settings label.
describe("core settings catalog mirror", () => {
  test("carries exactly the ids and source messages core renders", () => {
    const source = new Map(
      Object.values(SITE_SETTINGS_DESCRIPTORS).map((d) => [d.id, d.message]),
    );
    const mirror = new Map(
      Object.values(CORE_SETTINGS_DESCRIPTORS).map((d) => [d.id, d.message]),
    );
    expect(mirror).toStrictEqual(source);
  });
});
