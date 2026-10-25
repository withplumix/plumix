import { describe, expect, test } from "vitest";

import { roleEntries } from "@plumix/core/manifest";

import { CORE_ROLE_LABEL_DESCRIPTORS } from "./core-role-labels-i18n.js";

// Drift in either direction silently un-translates a default role's label.
describe("core role-label catalog mirror", () => {
  test("carries exactly the ids and source messages core ships", () => {
    const source = new Map(
      roleEntries().map(({ label }) =>
        typeof label === "string" ? [label, label] : [label.id, label.message],
      ),
    );
    const mirror = new Map(
      Object.values(CORE_ROLE_LABEL_DESCRIPTORS).map((d) => [d.id, d.message]),
    );
    expect(mirror).toStrictEqual(source);
  });
});
