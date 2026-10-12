import { describe, expect, test } from "vitest";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

import { visibleFieldsIn } from "./use-visible-fields.js";

const FIELDS: readonly MetaBoxFieldManifestEntry[] = [
  { key: "layout", label: "Layout", type: "string", inputType: "text" },
  {
    key: "videoUrl",
    label: "Video URL",
    type: "string",
    inputType: "url",
    visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
  },
];

describe("visibleFieldsIn", () => {
  test("a field whose condition fails is hidden", () => {
    expect(
      visibleFieldsIn(FIELDS, { layout: "standard" }).map((f) => f.key),
    ).toEqual(["layout"]);
  });

  test("a field whose condition passes is shown", () => {
    expect(
      visibleFieldsIn(FIELDS, { layout: "video" }).map((f) => f.key),
    ).toEqual(["layout", "videoUrl"]);
  });

  test("a missing bag hides every conditional field", () => {
    expect(visibleFieldsIn(FIELDS, undefined).map((f) => f.key)).toEqual([
      "layout",
    ]);
  });
});
