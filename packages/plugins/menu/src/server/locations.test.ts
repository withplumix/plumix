import { describe, expect, test } from "vitest";

import { declareLocations } from "./locations.js";

describe("declareLocations", () => {
  test("keys each valid declaration by its id", () => {
    const locations = declareLocations({
      primary: { label: "Primary navigation" },
      footer: { label: "Footer", description: "Bottom of every page" },
    });

    expect(locations.size).toBe(2);
    expect(locations.get("primary")).toEqual({
      id: "primary",
      label: "Primary navigation",
      description: undefined,
    });
    expect(locations.get("footer")).toEqual({
      id: "footer",
      label: "Footer",
      description: "Bottom of every page",
    });
  });

  test.each([
    ["empty id", ""],
    ["leading digit", "1main"],
    ["uppercase", "Primary"],
    ["space", "main nav"],
    ["underscore", "main_nav"],
    ["over length", "a".repeat(65)],
  ] as const)("rejects invalid id: %s", (_name, id) => {
    expect(() => declareLocations({ [id]: { label: "x" } })).toThrow();
  });

  test("rejects missing or empty label", () => {
    expect(() => declareLocations({ primary: { label: "" } })).toThrow();
    expect(() =>
      declareLocations({ primary: {} as unknown as { label: string } }),
    ).toThrow();
  });
});
