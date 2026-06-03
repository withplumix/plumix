import { useSyncExternalStore } from "react";

import type { LocaleDirection } from "@plumix/core/i18n";

// Subscribe to `<html dir>` set by SSR + the locale-switch reload path.
// Admin reloads on locale change ([[i18n-design]] / `language-card.tsx`),
// so the value only changes across mounts. `useSyncExternalStore` keeps
// the read SSR-safe and concurrent-mode safe with a noop subscribe.
const noop = (): void => undefined;
const subscribe = (): typeof noop => noop;

function read(): LocaleDirection {
  if (typeof document === "undefined") return "ltr";
  return document.documentElement.dir === "rtl" ? "rtl" : "ltr";
}

/** Returns the current document direction. Use for JS-side RTL logic
 *  (icon flips, animation direction, keyboard nav offsets) instead of
 *  comparing locale-code membership at every call site. CSS-side
 *  logic should prefer Tailwind's `rtl:` variant. */
export function useDir(): LocaleDirection {
  return useSyncExternalStore(subscribe, read, () => "ltr");
}
