import { describe, expect, test } from "vitest";

import { formFilterOptions, submissionColumns } from "./table.js";

describe("submissionColumns", () => {
  test("reads its columns from the rows' own label snapshots", () => {
    const columns = submissionColumns(
      [{ labels: { name: { label: "Your name" }, email: { label: "Email" } } }],
      3,
    );

    expect(columns).toEqual([
      { key: "name", label: "Your name" },
      { key: "email", label: "Email" },
    ]);
  });

  test("keeps a column a later row dropped, so an older row still reads", () => {
    const columns = submissionColumns(
      [
        { labels: { email: { label: "Email" } } },
        { labels: { name: { label: "Your name" }, email: { label: "Email" } } },
      ],
      3,
    );

    expect(columns.map((column) => column.key)).toEqual(["email", "name"]);
  });

  test("stops at as many columns as the table can show", () => {
    const columns = submissionColumns(
      [
        {
          labels: {
            a: { label: "A" },
            b: { label: "B" },
            c: { label: "C" },
          },
        },
      ],
      2,
    );

    expect(columns.map((column) => column.key)).toEqual(["a", "b"]);
  });
});

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
