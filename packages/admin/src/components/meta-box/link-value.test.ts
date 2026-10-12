import { describe, expect, test } from "vitest";

import {
  linkDraftFromValue,
  linkPickerScope,
  linkValueFromDraft,
  pickableLinkItems,
} from "./link-value.js";

describe("linkDraftFromValue", () => {
  test("a stored link prefills its url, label and new-tab", () => {
    expect(
      linkDraftFromValue({
        url: "https://example.com",
        label: "Go",
        newTab: true,
      }),
    ).toEqual({ url: "https://example.com", label: "Go", newTab: true });
  });

  test("no stored link is an empty draft", () => {
    expect(linkDraftFromValue(null)).toEqual({
      url: "",
      label: "",
      newTab: false,
    });
  });
});

describe("linkValueFromDraft", () => {
  test("the label and new-tab merge into the stored value", () => {
    expect(
      linkValueFromDraft({ url: "/pricing", label: "G", newTab: true }),
    ).toEqual({ url: "/pricing", label: "G", newTab: true });
  });

  test("an empty label and an off new-tab are left out", () => {
    expect(
      linkValueFromDraft({ url: "/pricing", label: "", newTab: false }),
    ).toEqual({ url: "/pricing" });
  });

  test("a draft without a URL stores null, whatever its link text", () => {
    expect(
      linkValueFromDraft({ url: "", label: "Go", newTab: false }),
    ).toBeNull();
  });
});

describe("linkPickerScope", () => {
  test("the picker searches the published entries of the public types", () => {
    expect(linkPickerScope(["post", "page"])).toEqual({
      entryTypes: ["post", "page"],
      status: "published",
    });
  });

  test("no public entry types leaves nothing to pick", () => {
    expect(linkPickerScope([])).toBeUndefined();
  });
});

describe("pickableLinkItems", () => {
  test("only entries with a public URL are offered", () => {
    expect(
      pickableLinkItems([
        { id: "1", label: "Pricing", targetType: "page", href: "/pricing" },
        { id: "2", label: "Internal", targetType: "page" },
      ]),
    ).toEqual([
      { id: "1", label: "Pricing", targetType: "page", href: "/pricing" },
    ]);
  });
});
