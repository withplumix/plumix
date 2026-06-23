import { describe, expect, test } from "vitest";

import {
  clampPan,
  clampPanToFrame,
  clampZoom,
  fitView,
  frameSelection,
  MAX_ZOOM,
  MIN_ZOOM,
  zoomToCursor,
} from "./canvas-view.js";

describe("clampZoom", () => {
  test("clamps to the allowed range", () => {
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });
});

describe("clampPan", () => {
  test("keeps a frame narrower than the viewport on-screen", () => {
    // 300px frame in a 1000px viewport: pan can range from a sliver visible on
    // the right (64 - 300) to a sliver on the left (1000 - 64).
    expect(clampPan(-9999, 300, 1000)).toBe(64 - 300);
    expect(clampPan(9999, 300, 1000)).toBe(1000 - 64);
    expect(clampPan(350, 300, 1000)).toBe(350);
  });

  test("keeps a frame wider than the viewport reachable from both edges", () => {
    // 2000px frame in an 800px viewport.
    expect(clampPan(-9999, 2000, 800)).toBe(64 - 2000);
    expect(clampPan(9999, 2000, 800)).toBe(800 - 64);
  });
});

describe("clampPanToFrame", () => {
  test("clamps both axes against the scaled frame and viewport", () => {
    // 300x200 frame in a 1000x800 viewport, pushed hard past both edges.
    const p = clampPanToFrame(9999, -9999, 300, 200, 1000, 800);
    expect(p.panX).toBe(1000 - 64);
    expect(p.panY).toBe(64 - 200);
  });
});

describe("fitView", () => {
  test("centers a narrow frame and never upscales past 100%", () => {
    // 375px frame, 600px tall content, 1000x800 viewport.
    const v = fitView(375, 600, 1000, 800);
    expect(v.zoom).toBe(1); // min(1, 1000/375) capped at 1
    expect(v.panX).toBe(Math.round((1000 - 375) / 2)); // centered horizontally
    expect(v.panY).toBe(Math.round((800 - 600) / 2)); // centered (content fits)
  });

  test("fits a wide frame to width and gives a top margin when it's tall", () => {
    // 1280px frame, 4000px tall, 700px viewport: fit zoom < 1, content taller
    // than viewport → top margin rather than vertical centering.
    const v = fitView(1280, 4000, 700, 800);
    expect(v.zoom).toBeCloseTo(700 / 1280, 5);
    expect(v.panX).toBe(0); // scaledW === viewport width → no horizontal slack
    expect(v.panY).toBe(32); // FIT_MARGIN_Y top margin
  });
});

describe("zoomToCursor", () => {
  test("keeps the world point under the cursor fixed", () => {
    // At zoom 1, pan 0, the cursor at (200,100) is over world (200,100).
    const v = zoomToCursor({ zoom: 1, panX: 0, panY: 0 }, 2, 200, 100);
    expect(v.zoom).toBe(2);
    // After zooming, that same world point must still sit under the cursor:
    // screen = pan + world*zoom === cursor.
    expect(v.panX + 200 * v.zoom).toBe(200);
    expect(v.panY + 100 * v.zoom).toBe(100);
  });

  test("clamps the target zoom", () => {
    expect(zoomToCursor({ zoom: 1, panX: 0, panY: 0 }, 99, 0, 0).zoom).toBe(
      MAX_ZOOM,
    );
  });
});

describe("frameSelection", () => {
  test("centers the block and fits it within the viewport padding", () => {
    // A 200x100 block at (300,400) in a 1000x800 viewport.
    const v = frameSelection(
      { x: 300, y: 400, width: 200, height: 100 },
      1000,
      800,
    );
    // Largest zoom fitting the block with 85% padding, capped at MAX_ZOOM.
    expect(v.zoom).toBe(MAX_ZOOM);
    // Block center (400,450) lands at the viewport center (500,400).
    expect(v.panX + 400 * v.zoom).toBe(500);
    expect(v.panY + 450 * v.zoom).toBe(400);
  });
});
