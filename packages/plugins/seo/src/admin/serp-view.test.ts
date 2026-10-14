import { describe, expect, test } from "vitest";

import { exclusionReason } from "./serp-view.js";

describe("exclusionReason", () => {
  test("a private site is named as the reason rather than the entry", () => {
    expect(exclusionReason("site_private")).toEqual({
      id: "plugin.seo.preview.reason.site_private",
      message: "The whole site is held out of search.",
    });
  });

  test("an entry the author hid says so in words", () => {
    expect(exclusionReason("entry_override")).toEqual({
      id: "plugin.seo.preview.reason.entry_override",
      message: "Hidden from search engines on this entry.",
    });
  });

  test("a type held out of search names the settings screen", () => {
    expect(exclusionReason("type_default")).toEqual({
      id: "plugin.seo.preview.reason.type_default",
      message: "This content type is held out of search in settings.",
    });
  });

  test("an indexable page says nothing about exclusion", () => {
    expect(exclusionReason("default")).toBeNull();
  });
});
