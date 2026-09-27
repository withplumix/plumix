import { describe, expect, test } from "vitest";

import { resolveMessage } from "./i18n-label.js";

describe("resolveMessage", () => {
  const edit = { id: "core.adminBar.edit", message: "Edit" };

  test("prefers the catalog entry over the source message", () => {
    expect(resolveMessage({ "core.adminBar.edit": ["Bearbeiten"] }, edit)).toBe(
      "Bearbeiten",
    );
    expect(resolveMessage({ "core.adminBar.edit": "Bearbeiten" }, edit)).toBe(
      "Bearbeiten",
    );
  });

  test("falls back to the source message when the entry is missing or empty", () => {
    expect(resolveMessage({}, edit)).toBe("Edit");
    expect(resolveMessage({ "core.adminBar.edit": [""] }, edit)).toBe("Edit");
  });

  test("interpolates a placeholder token and the source message's slot", () => {
    const load = { id: "x.load", message: "Load embed: {title}" };
    expect(
      resolveMessage({ "x.load": ["Einbettung laden: ", ["title"]] }, load, {
        title: "Clip",
      }),
    ).toBe("Einbettung laden: Clip");
    expect(resolveMessage({}, load, { title: "Clip" })).toBe(
      "Load embed: Clip",
    );
  });

  test("drops to the source message for a token it cannot read", () => {
    const count = { id: "x.count", message: "Items" };
    expect(
      resolveMessage({ "x.count": [["n", "plural", { one: ["one"] }]] }, count),
    ).toBe("Items");
  });
});
