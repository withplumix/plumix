import { describe, expect, test } from "vitest";

import {
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Tv,
  Watch,
} from "@plumix/admin-ui/icons";

import { parseUserAgent, pickIcon } from "./user-agent.js";

describe("pickIcon", () => {
  test("maps every device class an agent can report", () => {
    for (const [deviceType, icon] of [
      ["mobile", Smartphone],
      ["tablet", Tablet],
      ["wearable", Watch],
      ["smarttv", Tv],
      ["console", Tv],
      ["embedded", Monitor],
      ["xr", Monitor],
      [undefined, Monitor],
    ] as const) {
      expect(pickIcon(deviceType)).toBe(icon);
    }
  });
});

describe("parseUserAgent", () => {
  // Guards the pin to the 1.x line: 2.x relicensed to AGPL-3.0 (see LICENSE),
  // and the two versions report device types identically.
  test("reads a device class off a real agent string", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(parseUserAgent(ua).icon).toBe(Smartphone);
  });

  test("reports nothing and falls back to the globe icon without an agent", () => {
    expect(parseUserAgent(null)).toStrictEqual({
      browser: null,
      os: null,
      icon: Globe,
      raw: null,
    });
  });
});
