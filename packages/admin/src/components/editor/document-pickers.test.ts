import { describe, expect, test } from "vitest";

import { visibleDocumentPickers } from "./document-pickers.js";

const onChange = (): void => undefined;

describe("visibleDocumentPickers", () => {
  test("shows a term picker per taxonomy", () => {
    const { taxonomies } = visibleDocumentPickers({
      taxonomies: [
        {
          name: "category",
          label: "Categories",
          options: [{ value: "1", label: "News", depth: 0 }],
          value: ["1"],
          onChange,
        },
        { name: "post_tag", label: "Tags", options: [], value: [], onChange },
      ],
    });

    expect(taxonomies.map((taxonomy) => taxonomy.name)).toEqual([
      "category",
      "post_tag",
    ]);
  });

  test("shows no term pickers when the type has no taxonomies", () => {
    expect(visibleDocumentPickers({}).taxonomies).toEqual([]);
  });

  test("shows no template picker when the theme registers no named templates", () => {
    const { template } = visibleDocumentPickers({
      template: { value: null, options: [], onChange },
    });

    expect(template).toBeNull();
  });

  test("shows the visibility picker when the type declares selectable policies", () => {
    const access = {
      value: "members",
      options: [
        { key: "members", label: "Members only" },
        { key: "staff", label: "Staff only" },
      ],
      onChange,
    };

    expect(visibleDocumentPickers({ access }).access).toBe(access);
  });

  test("shows no visibility picker when the type declares no selectable policies", () => {
    const { access } = visibleDocumentPickers({
      access: { value: null, options: [], onChange },
    });

    expect(access).toBeNull();
  });
});
