import { describe, expect, test } from "vitest";

import { isPaletteToggleKey } from "./palette-shortcut.js";

describe("isPaletteToggleKey", () => {
  test("Cmd+K toggles the palette", () => {
    expect(
      isPaletteToggleKey({ key: "k", metaKey: true, ctrlKey: false }),
    ).toBe(true);
  });

  test("Ctrl+K toggles the palette for non-mac keyboards", () => {
    expect(
      isPaletteToggleKey({ key: "k", metaKey: false, ctrlKey: true }),
    ).toBe(true);
  });

  test("a bare K types into the page instead", () => {
    expect(
      isPaletteToggleKey({ key: "k", metaKey: false, ctrlKey: false }),
    ).toBe(false);
  });

  test("Cmd with another key leaves the palette alone", () => {
    expect(
      isPaletteToggleKey({ key: "j", metaKey: true, ctrlKey: false }),
    ).toBe(false);
  });
});
