import { useSyncExternalStore } from "react";

import type { LocaleDirection } from "@plumix/core/i18n";

// A locale change reloads the admin, so `<html dir>` never changes within a
// mount.
const noop = (): void => undefined;
const subscribe = (): typeof noop => noop;

function read(): LocaleDirection {
  if (typeof document === "undefined") return "ltr";
  return document.documentElement.dir === "rtl" ? "rtl" : "ltr";
}

/** For JS-side RTL logic only; CSS should prefer Tailwind's `rtl:` variant. */
export function useDir(): LocaleDirection {
  return useSyncExternalStore(subscribe, read, () => "ltr");
}
