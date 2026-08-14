import { describe, expect, test } from "vitest";

import { createCameraStore } from "./camera-store.js";
import { MAX_ZOOM, MIN_ZOOM } from "./canvas-view.js";

describe("camera store", () => {
  test("defaults: centered, unscaled, in fit mode, no viewport yet", () => {
    const camera = createCameraStore();
    const s = camera.getState();
    expect(s.zoom).toBe(1);
    expect(s.panX).toBe(0);
    expect(s.panY).toBe(0);
    expect(s.viewportW).toBe(0);
    expect(s.viewportH).toBe(0);
    expect(s.fit).toBe(true);
  });

  test("seeds the initial zoom", () => {
    expect(createCameraStore({ zoom: 0.5 }).getState().zoom).toBe(0.5);
  });

  test("zoomToCenter clamps to the allowed range", () => {
    const camera = createCameraStore();

    camera.getState().zoomToCenter(99);
    expect(camera.getState().zoom).toBe(MAX_ZOOM);

    camera.getState().zoomToCenter(0);
    expect(camera.getState().zoom).toBe(MIN_ZOOM);
  });

  test("zoomToCenter keeps the viewport center's point fixed and leaves fit", () => {
    const camera = createCameraStore();
    camera.getState().setViewport(1000, 800);
    camera.getState().applyView({ zoom: 1, panX: 0, panY: 0 });

    camera.getState().zoomToCenter(2);

    expect(camera.getState().zoom).toBe(2);
    // center (500,400) was world (500,400) at zoom 1; at zoom 2 it must still
    // land at the viewport center: pan = center - world*zoom.
    expect(camera.getState().panX).toBe(500 - 500 * 2);
    expect(camera.getState().panY).toBe(400 - 400 * 2);
    expect(camera.getState().fit).toBe(false);
  });

  test("zoomToCenter without a measured viewport still zooms and leaves fit", () => {
    const camera = createCameraStore();

    camera.getState().zoomToCenter(1.5);

    expect(camera.getState().zoom).toBe(1.5);
    expect(camera.getState().fit).toBe(false);
  });

  test("applyView is a manual gesture: clamps zoom, sets pan, leaves fit", () => {
    const camera = createCameraStore();

    camera.getState().applyView({ zoom: 99, panX: 10, panY: 20 });

    expect(camera.getState().zoom).toBe(MAX_ZOOM);
    expect(camera.getState().panX).toBe(10);
    expect(camera.getState().panY).toBe(20);
    expect(camera.getState().fit).toBe(false);
  });

  test("applyView with fit keeps fit mode (the canvas-driven re-fit)", () => {
    const camera = createCameraStore();
    camera.getState().zoomToCenter(1.5); // leave fit first
    expect(camera.getState().fit).toBe(false);

    camera.getState().enableFit();
    camera
      .getState()
      .applyView({ zoom: 0.8, panX: 10, panY: 20 }, { fit: true });

    expect(camera.getState().zoom).toBe(0.8);
    expect(camera.getState().panX).toBe(10);
    expect(camera.getState().fit).toBe(true);
  });

  test("applyView with fit leaves the fit flag untouched, never forcing it on", () => {
    const camera = createCameraStore();
    camera.getState().zoomToCenter(1.5); // fit is now off
    expect(camera.getState().fit).toBe(false);

    // The fit-driven re-fit must not resurrect fit mode on its own (it runs
    // only while already fitting); a stray call while off stays off.
    camera.getState().applyView({ zoom: 0.8, panX: 1, panY: 2 }, { fit: true });

    expect(camera.getState().zoom).toBe(0.8);
    expect(camera.getState().fit).toBe(false);
  });

  test("setViewport mirrors the host size", () => {
    const camera = createCameraStore();

    camera.getState().setViewport(640, 480);

    expect(camera.getState().viewportW).toBe(640);
    expect(camera.getState().viewportH).toBe(480);
  });

  test("setViewport leaves the view untouched when the size is unchanged", () => {
    const camera = createCameraStore();
    camera.getState().setViewport(640, 480);
    camera.getState().applyView({ zoom: 1.5, panX: 5, panY: 6 });

    camera.getState().setViewport(640, 480);

    // Re-reporting the same size disturbs neither zoom nor pan.
    const s = camera.getState();
    expect(s.zoom).toBe(1.5);
    expect(s.panX).toBe(5);
    expect(s.panY).toBe(6);
  });

  test("enableFit re-enters fit mode", () => {
    const camera = createCameraStore();
    camera.getState().zoomToCenter(1.5);
    expect(camera.getState().fit).toBe(false);

    camera.getState().enableFit();
    expect(camera.getState().fit).toBe(true);
  });
});
