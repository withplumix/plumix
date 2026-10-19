import { describe, expect, test } from "vitest";

import { conflictDialog, editingElsewhere } from "./conflict-dialog.js";

const theirs = {
  etag: "1792411205",
  updatedAt: new Date("2026-10-18T12:00:05Z"),
};
const later = {
  etag: "1792411209",
  updatedAt: new Date("2026-10-18T12:00:09Z"),
};

describe("conflictDialog", () => {
  test("a conflict opens it on when the entry changed", () => {
    expect(
      conflictDialog({ open: false }, { type: "conflict", conflict: theirs }),
    ).toEqual({ open: true, conflict: theirs });
  });

  test("a second conflict while open shows the later change", () => {
    expect(
      conflictDialog(
        { open: true, conflict: theirs },
        { type: "conflict", conflict: later },
      ),
    ).toEqual({ open: true, conflict: later });
  });

  test.each(["keepMine", "loadTheirs"] as const)(
    "choosing %s closes it",
    (type) => {
      expect(
        conflictDialog({ open: true, conflict: theirs }, { type }),
      ).toEqual({ open: false });
    },
  );
});

describe("editingElsewhere", () => {
  test("names another user holding the lease", () => {
    expect(
      editingElsewhere({ ...theirs, holder: { id: 2, name: "Ada" } }, 1),
    ).toEqual({ id: 2, name: "Ada" });
  });

  test("names no one when the author holds the lease, from this tab or another", () => {
    expect(
      editingElsewhere({ ...theirs, holder: { id: 1, name: "Me" } }, 1),
    ).toBeUndefined();
  });

  test("names no one when nobody holds the lease", () => {
    expect(editingElsewhere(theirs, 1)).toBeUndefined();
  });
});
