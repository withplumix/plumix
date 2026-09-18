import { describe, expect, test } from "vitest";

import { normalizeDebugBar } from "./config.js";

describe("normalizeDebugBar", () => {
  test("defaults to on with the standard chrome when unconfigured", () => {
    const config = normalizeDebugBar(undefined);

    expect(config.enabled).toBe(true);
    expect(config.position).toBe("bottom-right");
    expect(config.defaultOpen).toBe(false);
  });

  test("`false` is the only spelling of off", () => {
    expect(normalizeDebugBar(false).enabled).toBe(false);
  });

  test("`true` leaves the bar on", () => {
    expect(normalizeDebugBar(true).enabled).toBe(true);
  });

  test("settings carry through and never affect enablement", () => {
    const config = normalizeDebugBar({
      position: "top-left",
      defaultOpen: true,
    });

    expect(config.enabled).toBe(true);
    expect(config.position).toBe("top-left");
    expect(config.defaultOpen).toBe(true);
  });
});
