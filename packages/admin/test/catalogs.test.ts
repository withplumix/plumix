import { describe, expect, test } from "vitest";

import { messages as deMessages } from "../locales/de.mjs";
import { messages as enMessages } from "../locales/en.mjs";

/**
 * Regression: hand-maintained breadcrumb entries lacking the
 * `#. js-lingui-explicit-id` marker get their IDs hashed by
 * `@lingui/format-po`'s deserializer, so `i18n._("breadcrumb.X")`
 * silently falls back to source text in every locale. Compile-time
 * snapshot pinned here to fail loud if either entry is dropped or
 * unmarked.
 */
const BREADCRUMB_IDS = [
  "breadcrumb.addNew",
  "breadcrumb.admin",
  "breadcrumb.create",
  "breadcrumb.dashboard",
  "breadcrumb.edit",
  "breadcrumb.editUser",
  "breadcrumb.entries",
  "breadcrumb.profile",
  "breadcrumb.settings",
  "breadcrumb.terms",
  "breadcrumb.users",
] as const;

describe("compiled catalogs", () => {
  test.each(BREADCRUMB_IDS)("en catalog includes %s", (id) => {
    expect((enMessages as Record<string, unknown>)[id]).toBeDefined();
  });

  test.each(BREADCRUMB_IDS)(
    "de catalog includes %s with a translation",
    (id) => {
      const value = (deMessages as Record<string, unknown>)[id];
      expect(value).toBeDefined();
    },
  );
});
