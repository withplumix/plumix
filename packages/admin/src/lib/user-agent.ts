import type { LucideIcon } from "lucide-react";
import { Globe, Monitor, Smartphone, Tablet, Tv, Watch } from "lucide-react";
import { UAParser } from "ua-parser-js";

// Pretty-prints a `User-Agent` string into something humans can scan in
// a session list ("Chrome on macOS", "Safari on iPhone"), and picks an
// icon that matches the device class. Uses ua-parser-js because hand-
// rolling UA detection is a tar pit; the lib is ~30KB gzip and stays
// current with new browsers/OSes via admin redeploys.

interface ParsedUserAgent {
  /** Compact "Browser on OS" label, or "Unknown device" when the UA is unparseable / null. */
  readonly label: string;
  /** Lucide icon matching the device class (desktop/tablet/mobile/etc). */
  readonly icon: LucideIcon;
  /** Raw UA string for tooltips / advanced display. Null when input was null. */
  readonly raw: string | null;
}

export function parseUserAgent(ua: string | null): ParsedUserAgent {
  if (!ua) {
    return { label: "Unknown device", icon: Globe, raw: null };
  }
  const parsed = UAParser(ua);
  const browser = parsed.browser.name;
  const os = parsed.os.name;
  const label = formatLabel(browser, os);
  return {
    label,
    icon: pickIcon(parsed.device.type),
    raw: ua,
  };
}

function formatLabel(
  browser: string | undefined,
  os: string | undefined,
): string {
  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return "Unknown device";
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
