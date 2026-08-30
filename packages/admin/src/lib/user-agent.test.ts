import { describe, expect, test } from "vitest";

import {
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Tv,
  Watch,
} from "@plumix/admin-ui/icons";

import { parseUserAgent } from "./user-agent.js";

// Covers our device-class-to-icon mapping, not the parser behind it: every
// branch of `pickIcon`, including the two fallbacks that decide what a session
// row shows when the agent is unrecognised or absent.

describe("parseUserAgent", () => {
  test.for([
    [
      "phone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      Smartphone,
    ],
    [
      "tablet",
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      Tablet,
    ],
    [
      "wearable",
      "Mozilla/5.0 (Linux; Android 13; SM-R800) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Watch,
    ],
    [
      "smart tv",
      "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 TV Safari/537.36",
      Tv,
    ],
    [
      "desktop",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Monitor,
    ],
    ["an unrecognised agent", "curl/8.4.0", Monitor],
  ] as const)("picks the %s icon", ([, ua, icon]) => {
    expect(parseUserAgent(ua).icon).toBe(icon);
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
