import { describe, expect, test } from "vitest";

import { submissionColumns } from "./columns.js";

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

  // What an export passes: the point of it is every answer, not the few
  // that fit beside the date and the status.
  test("names every column when no limit is asked for", () => {
    const columns = submissionColumns([
      { labels: { a: { label: "A" }, b: { label: "B" }, c: { label: "C" } } },
    ]);

    expect(columns.map((column) => column.key)).toEqual(["a", "b", "c"]);
  });
});
