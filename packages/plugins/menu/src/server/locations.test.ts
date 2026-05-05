import { afterEach, describe, expect, test } from "vitest";

import {
  clearRegisteredLocations,
  getRegisteredLocations,
  recordLocation,
} from "./locations.js";

describe("menu locations registry", () => {
  afterEach(() => {
    clearRegisteredLocations();
  });

  test("stores valid registrations keyed by id", () => {
    recordLocation("primary", { label: "Primary navigation" });
    recordLocation("footer", {
      label: "Footer",
      description: "Bottom of every page",
    });

    const registered = getRegisteredLocations();
    expect(registered.size).toBe(2);
    expect(registered.get("primary")).toEqual({
      id: "primary",
      label: "Primary navigation",
      description: undefined,
    });
    expect(registered.get("footer")).toEqual({
      id: "footer",
      label: "Footer",
      description: "Bottom of every page",
    });
  });

  test.each([
    ["empty id", "", { label: "x" }],
    ["leading digit", "1main", { label: "x" }],
    ["uppercase", "Primary", { label: "x" }],
    ["space", "main nav", { label: "x" }],
    ["underscore", "main_nav", { label: "x" }],
    ["over length", "a".repeat(65), { label: "x" }],
  ] as const)("rejects invalid id: %s", (_name, id, options) => {
    expect(() => recordLocation(id, options)).toThrow();
  });

  test("rejects missing or empty label", () => {
    expect(() => recordLocation("primary", { label: "" })).toThrow();
    expect(() =>
      recordLocation("primary", {} as unknown as { label: string }),
    ).toThrow();
  });

  test("rejects duplicate id across calls", () => {
    recordLocation("primary", { label: "A" });
    expect(() => recordLocation("primary", { label: "B" })).toThrow(
      /already registered/,
    );
  });
});
