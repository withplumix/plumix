import { describe, expect, test } from "vitest";

import {
  idleTimeout,
  interactionEvents,
  visibleRootMargin,
} from "./options.js";

describe("idleTimeout", () => {
  test("caps the idle wait at 2000ms by default", () => {
    expect(idleTimeout({})).toBe(2000);
  });

  test("takes the island's `timeout` option", () => {
    expect(idleTimeout({ timeout: 500 })).toBe(500);
  });
});

describe("visibleRootMargin", () => {
  test("starts loading 200px before the island enters view by default", () => {
    expect(visibleRootMargin({})).toBe("200px");
  });

  test("takes the island's `rootMargin` option", () => {
    expect(visibleRootMargin({ rootMargin: "0px" })).toBe("0px");
  });
});

describe("interactionEvents", () => {
  test("hydrates on hover, focus, press, click and keypress by default", () => {
    expect([...interactionEvents({})]).toEqual([
      "pointerenter",
      "focusin",
      "pointerdown",
      "click",
      "keydown",
    ]);
  });

  test("takes the island's `events` option", () => {
    expect([...interactionEvents({ events: ["keydown"] })]).toEqual([
      "keydown",
    ]);
  });

  test("falls back to every event when `events` names none", () => {
    expect(interactionEvents({ events: [] }).size).toBe(5);
  });
});
