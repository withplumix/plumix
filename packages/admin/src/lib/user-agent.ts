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

// ua-parser-js because hand-rolled UA detection is a tar pit.

interface ParsedUserAgent {
  // Vendor names are universal, so they're not localized.
  readonly browser: string | null;
  readonly os: string | null;
  readonly icon: LucideIcon;
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

// `device.type` is undefined for desktop; rare types collapse into the closest
// icon.
export function pickIcon(deviceType: string | undefined): LucideIcon {
  if (deviceType === "mobile") return Smartphone;
  if (deviceType === "tablet") return Tablet;
  if (deviceType === "wearable") return Watch;
  if (deviceType === "smarttv" || deviceType === "console") return Tv;
  // Desktop (undefined), embedded, xr, anything else → desktop icon.
  return Monitor;
}
