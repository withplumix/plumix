import { describe, expect, test } from "vitest";

import { formFilterOptions } from "./table.js";

describe("formFilterOptions", () => {
  test("offers every declared form under its own title", () => {
    expect(
      formFilterOptions(
        [{ slug: "contact", title: "Contact us" }],
        [],
        undefined,
      ),
    ).toEqual([{ slug: "contact", title: "Contact us" }]);
  });

  test("offers a slug that only has a backlog, under the slug itself", () => {
    expect(
      formFilterOptions(
        [{ slug: "contact", title: "Contact us" }],
        ["contact", "retired"],
        undefined,
      ),
    ).toEqual([
      { slug: "contact", title: "Contact us" },
      { slug: "retired", title: "retired" },
    ]);
  });

  test("keeps the slug being filtered by, even with nothing counted under it", () => {
    expect(
      formFilterOptions([], [], "retired").map((form) => form.slug),
    ).toEqual(["retired"]);
  });
});
