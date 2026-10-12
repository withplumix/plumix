import { describe, expect, test } from "vitest";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

import { labelText } from "../../../test/label-text.js";
import { newRepeaterRow, repeaterRows, rowSummary } from "./repeater-rows.js";

const LINK_SUBFIELDS: readonly MetaBoxFieldManifestEntry[] = [
  { key: "label", label: "Label", type: "string", inputType: "text" },
  { key: "href", label: "URL", type: "string", inputType: "url" },
];

describe("newRepeaterRow", () => {
  test("every subfield gets an empty slot", () => {
    expect(newRepeaterRow(LINK_SUBFIELDS)).toEqual({
      label: null,
      href: null,
    });
  });

  test("a subfield with a default starts from it, nested groups included", () => {
    expect(
      newRepeaterRow([
        {
          key: "label",
          label: "Label",
          type: "string",
          inputType: "text",
          default: "Read more",
        },
        { key: "href", label: "URL", type: "string", inputType: "url" },
        {
          key: "seo",
          label: "SEO",
          type: "json",
          inputType: "group",
          subFields: [
            {
              key: "rel",
              label: "Rel",
              type: "string",
              inputType: "text",
              default: "nofollow",
            },
          ],
        },
      ]),
    ).toEqual({ label: "Read more", href: null, seo: { rel: "nofollow" } });
  });
});

describe("repeaterRows", () => {
  test("a stored value that isn't an array has no rows", () => {
    expect(repeaterRows("not an array")).toEqual([]);
  });

  test("a malformed row drops from display", () => {
    expect(repeaterRows([{ label: "Home" }, "stray", null])).toEqual([
      { label: "Home" },
    ]);
  });
});

describe("rowSummary", () => {
  test("the first non-empty subfield labels the row", () => {
    expect(
      rowSummary(
        { label: "", href: "/" },
        LINK_SUBFIELDS,
        undefined,
        labelText,
      ),
    ).toBe("/");
  });

  test("the collapsed key picks which subfield labels the row", () => {
    expect(
      rowSummary(
        { label: "Home", href: "/docs" },
        LINK_SUBFIELDS,
        "href",
        labelText,
      ),
    ).toBe("/docs");
  });

  test("a condition-hidden cell never labels the row", () => {
    expect(
      rowSummary(
        { kind: "", choices: "left over from when it showed" },
        [
          { key: "kind", label: "Kind", type: "string", inputType: "text" },
          {
            key: "choices",
            label: "Choices",
            type: "string",
            inputType: "text",
            visibleWhen: [[{ key: "kind", op: "eq", value: "select" }]],
          },
        ],
        undefined,
        labelText,
      ),
    ).toBeNull();
  });

  test("a select subfield's stored value reads as its option label", () => {
    expect(
      rowSummary(
        { style: "card" },
        [
          {
            key: "style",
            label: "Style",
            type: "string",
            inputType: "select",
            options: [
              { value: "card", label: "Card" },
              { value: "banner", label: "Banner" },
            ],
          },
        ],
        undefined,
        labelText,
      ),
    ).toBe("Card");
  });
});
