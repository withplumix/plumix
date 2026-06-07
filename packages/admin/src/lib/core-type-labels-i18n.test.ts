import { describe, expect, test } from "vitest";

import {
  GENERIC_ENTRY_TYPE_LABELS,
  GENERIC_TERM_TAXONOMY_LABELS,
} from "@plumix/core/i18n";

import { CORE_TYPE_LABEL_DESCRIPTORS } from "./core-type-labels-i18n.js";

// Source has ids shared across the entry + taxonomy tables — the union
// dedups them. Drift in either direction silently un-translates a label.
describe("core type-label catalog mirror", () => {
  test("carries exactly the ids and source messages core renders", () => {
    const source = new Map<string, string | undefined>();
    for (const descriptor of [
      ...Object.values(GENERIC_ENTRY_TYPE_LABELS),
      ...Object.values(GENERIC_TERM_TAXONOMY_LABELS),
    ]) {
      source.set(descriptor.id, descriptor.message);
    }
    const mirror = new Map(
      Object.values(CORE_TYPE_LABEL_DESCRIPTORS).map((d) => [d.id, d.message]),
    );
    expect(mirror).toStrictEqual(source);
  });
});
