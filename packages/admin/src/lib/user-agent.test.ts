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

// Guards the UA library swap (see LICENSE, "Bundled dependencies"): the icon
// a session row shows is the functional output and must not move. Vendor
// name strings are the library's own labels and are asserted loosely, since
// they drift between upstream releases without changing what a reader sees.

const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const GALAXY_WATCH =
  "Mozilla/5.0 (Linux; Android 13; SM-R800) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
const TIZEN_TV =
  "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 TV Safari/537.36";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";

describe("parseUserAgent device icons", () => {
  test.for([
    ["desktop browser", MAC_CHROME, Monitor],
    ["phone", IPHONE_SAFARI, Smartphone],
    ["tablet", IPAD_SAFARI, Tablet],
    ["wearable", GALAXY_WATCH, Watch],
    ["smart tv", TIZEN_TV, Tv],
  ] as const)("%s", ([, ua, icon]) => {
    expect(parseUserAgent(ua).icon).toBe(icon);
  });

  test("an unparseable agent still resolves to the desktop icon", () => {
    expect(parseUserAgent("curl/8.4.0").icon).toBe(Monitor);
  });
});

describe("parseUserAgent names", () => {
  test.for([
    [MAC_CHROME, /chrome/i, /mac ?os/i],
    [IPHONE_SAFARI, /safari/i, /ios/i],
    [WINDOWS_EDGE, /edge/i, /windows/i],
  ] as const)("%s", ([ua, browser, os]) => {
    const parsed = parseUserAgent(ua);
    expect(parsed.browser).toMatch(browser);
    expect(parsed.os).toMatch(os);
  });

  test("passes the raw agent through for the tooltip", () => {
    expect(parseUserAgent(MAC_CHROME).raw).toBe(MAC_CHROME);
  });
});

describe("parseUserAgent without an agent string", () => {
  test("reports nothing and falls back to the globe icon", () => {
    expect(parseUserAgent(null)).toStrictEqual({
      browser: null,
      os: null,
      icon: Globe,
      raw: null,
    });
  });
});
