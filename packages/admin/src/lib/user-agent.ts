import { UAParser } from "ua-parser-js";

import type { LucideIcon } from "@plumix/admin-ui/icons";
import {
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Tv,
  Watch,
} from "@plumix/admin-ui/icons";

// Pretty-prints a `User-Agent` string into something humans can scan in
// a session list ("Chrome on macOS", "Safari on iPhone"), and picks an
// icon that matches the device class. Uses ua-parser-js because hand-
// rolling UA detection is a tar pit; the lib is ~30KB gzip and stays
// current with new browsers/OSes via admin redeploys.

interface ParsedUserAgent {
  /** Vendor browser name (`"Chrome"`, `"Safari"`); null when ua-parser
   *  can't identify one. Vendor names are universal — consumers
   *  interpolate them into a localized "{browser} on {os}" template. */
  readonly browser: string | null;
  /** OS family name (`"macOS"`, `"iPhone"`); null when unidentified. */
  readonly os: string | null;
  /** Lucide icon matching the device class (desktop/tablet/mobile/etc). */
  readonly icon: LucideIcon;
  /** Raw UA string for tooltips / advanced display. Null when input was null. */
  readonly raw: string | null;
}

export function parseUserAgent(ua: string | null): ParsedUserAgent {
  if (!ua) {
    return { browser: null, os: null, icon: Globe, raw: null };
  }
  const parsed = UAParser(ua);
  return {
    browser: parsed.browser.name ?? null,
    os: parsed.os.name ?? null,
    icon: pickIcon(parsed.device.type),
    raw: ua,
  };
}

// ua-parser-js's `device.type` is undefined for desktop browsers and
// one of `mobile` / `tablet` / `console` / `smarttv` / `wearable` /
// `embedded` / `xr` for everything else. We collapse the rare ones
// into the closest visual category so the icon set stays small.
function pickIcon(deviceType: string | undefined): LucideIcon {
  if (deviceType === "mobile") return Smartphone;
  if (deviceType === "tablet") return Tablet;
  if (deviceType === "wearable") return Watch;
  if (deviceType === "smarttv" || deviceType === "console") return Tv;
  // Desktop (undefined), embedded, xr, anything else → desktop icon.
  return Monitor;
}
