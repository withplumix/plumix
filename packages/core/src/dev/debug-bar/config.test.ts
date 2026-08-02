import { describe, expect, test } from "vitest";

import { normalizeDebugBar } from "./config.js";

describe("normalizeDebugBar", () => {
  test("defaults to on-in-dev with sensible chrome defaults when unconfigured", () => {
    const config = normalizeDebugBar(undefined);

    expect(config.enabled).toBe(true);
    expect(config.disabled.size).toBe(0);
    expect(config.position).toBe("bottom-right");
    expect(config.defaultOpen).toBe(false);
  });

  test("`false` disables the bar", () => {
    expect(normalizeDebugBar(false).enabled).toBe(false);
  });

  test("`true` enables the bar", () => {
    expect(normalizeDebugBar(true).enabled).toBe(true);
  });

  test("`{ enabled: false }` disables the bar", () => {
    expect(normalizeDebugBar({ enabled: false }).enabled).toBe(false);
  });

  test("`disable` becomes a denylist Set without affecting enablement", () => {
    const config = normalizeDebugBar({ disable: ["timeline", "database"] });

    expect(config.enabled).toBe(true);
    expect(config.disabled.has("timeline")).toBe(true);
    expect(config.disabled.has("database")).toBe(true);
    expect(config.disabled.has("request")).toBe(false);
  });

  test("carries through position and defaultOpen overrides", () => {
    const config = normalizeDebugBar({
      position: "top-left",
      defaultOpen: true,
    });

    expect(config.position).toBe("top-left");
    expect(config.defaultOpen).toBe(true);
  });
});
