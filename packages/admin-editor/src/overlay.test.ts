import { describe, expect, test } from "vitest";

import { overlayBox } from "./overlay.js";

describe("overlayBox", () => {
  // Pins the iframe→screen transform — the old Puck zoom-overlay bug lived here.
  test("maps an iframe rect to screen coords by offset and zoom", () => {
    const box = overlayBox(
      { x: 10, y: 20, width: 100, height: 40 },
      { left: 5, top: 8 },
      0.5,
    );

    expect(box).toEqual({ left: 10, top: 18, width: 50, height: 20 });
  });

  test("at 100% zoom it is the rect shifted by the iframe offset", () => {
    const box = overlayBox(
      { x: 0, y: 0, width: 200, height: 100 },
      { left: 30, top: 40 },
      1,
    );

    expect(box).toEqual({ left: 30, top: 40, width: 200, height: 100 });
  });
});
