import { describe, expect, test } from "vitest";

import {
  canAddHtmlAttr,
  canRenameHtmlAttr,
  htmlAttrName,
  htmlAttrSuggestions,
} from "./html-attribute-rules.js";

describe("htmlAttrName", () => {
  test("normalizes a typed key to lowercase so the renderer keeps it", () => {
    expect(htmlAttrName(" Data-Track ")).toBe("data-track");
  });
});

describe("htmlAttrSuggestions", () => {
  test("offers to create an allowlisted attribute, lowercased", () => {
    expect(htmlAttrSuggestions("Data-Track", []).create).toBe("data-track");
  });

  test("offers no create item for a disallowed attribute name", () => {
    expect(htmlAttrSuggestions("onclick", []).create).toBeNull();
  });

  test("offers no create item for a case-variant of an existing attribute", () => {
    expect(htmlAttrSuggestions("DATA-TRACK", ["data-track"]).create).toBeNull();
  });

  test("excludes already-set attributes from the common ones", () => {
    const { options } = htmlAttrSuggestions("", ["id"]);

    expect(options).toContain("title");
    expect(options).not.toContain("id");
  });
});

describe("canRenameHtmlAttr", () => {
  test("renames onto an allowlisted, unused attribute", () => {
    expect(canRenameHtmlAttr("id", "title", ["id"])).toBe(true);
  });

  test("rejects a disallowed attribute name", () => {
    expect(canRenameHtmlAttr("id", "onclick", ["id"])).toBe(false);
  });

  test("won't rename onto a case-variant of a sibling", () => {
    expect(canRenameHtmlAttr("id", "data-track", ["id", "Data-Track"])).toBe(
      false,
    );
  });
});

describe("canAddHtmlAttr", () => {
  test("adds a picked attribute with a value", () => {
    expect(canAddHtmlAttr("role", "banner", [])).toBe(true);
  });

  test("won't add an attribute already set", () => {
    expect(canAddHtmlAttr("id", "x", ["ID"])).toBe(false);
  });

  test("does not add an attribute with an empty value", () => {
    expect(canAddHtmlAttr("role", " ", [])).toBe(false);
  });
});
