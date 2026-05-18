import { describe, expect, test } from "vitest";

import { clampMenuPosition } from "./position.js";

const VIEWPORT = {
  width: 480,
  height: 800,
  scrollX: 0,
  scrollY: 0,
};

const MENU = { width: 240, height: 320 };

describe("clampMenuPosition", () => {
  test("places the mount below the caret with a 4px gap by default", () => {
    const pos = clampMenuPosition({
      caret: { top: 100, bottom: 120, left: 50 },
      viewport: VIEWPORT,
      menu: MENU,
    });
    expect(pos.top).toBe(124);
    expect(pos.left).toBe(50);
  });

  test("flips above the caret when the menu would clip the bottom edge", () => {
    const pos = clampMenuPosition({
      caret: { top: 600, bottom: 620, left: 50 },
      viewport: VIEWPORT,
      menu: MENU,
    });
    // 600 - 4 - 320 = 276 above the caret
    expect(pos.top).toBe(276);
  });

  test("shifts left when the caret is near the right edge", () => {
    // Caret at left=400 with menu width 240 would land at 400..640 —
    // right edge clips at viewport 480. Should clamp to 480 - 240 = 240.
    const pos = clampMenuPosition({
      caret: { top: 100, bottom: 120, left: 400 },
      viewport: VIEWPORT,
      menu: MENU,
    });
    expect(pos.left).toBe(240);
  });

  test("pins to the left edge when the caret is off-screen left", () => {
    const pos = clampMenuPosition({
      caret: { top: 100, bottom: 120, left: -20 },
      viewport: VIEWPORT,
      menu: MENU,
    });
    expect(pos.left).toBe(0);
  });

  test("page-space top accounts for window scrollY", () => {
    const pos = clampMenuPosition({
      caret: { top: 100, bottom: 120, left: 50 },
      viewport: { ...VIEWPORT, scrollY: 200 },
      menu: MENU,
    });
    expect(pos.top).toBe(324);
  });

  test("page-space left accounts for window scrollX", () => {
    const pos = clampMenuPosition({
      caret: { top: 100, bottom: 120, left: 50 },
      viewport: { ...VIEWPORT, scrollX: 30 },
      menu: MENU,
    });
    expect(pos.left).toBe(80);
  });

  test("pins top=0 when flipping above would push the menu off the top", () => {
    // Caret at top=50 with no room below (height=200, viewport=200);
    // menu.height=320 — flip-above would land at 50 - 4 - 320 = -274.
    const pos = clampMenuPosition({
      caret: { top: 50, bottom: 70, left: 50 },
      viewport: { width: 480, height: 200, scrollX: 0, scrollY: 0 },
      menu: MENU,
    });
    expect(pos.top).toBe(0);
  });

  test("pins to left=0 when the menu is wider than the viewport", () => {
    const pos = clampMenuPosition({
      caret: { top: 100, bottom: 120, left: 100 },
      viewport: { ...VIEWPORT, width: 200 },
      menu: { width: 240, height: 320 },
    });
    expect(pos.left).toBe(0);
  });
});
