import { useMemo } from "react";
import { useLingui } from "@lingui/react";

// `@plumix/core/i18n` subpath — importing from the root barrel
// (`@plumix/core`) drags `context/stores.js` into admin's browser
// bundle, which eagerly evaluates `new AsyncLocalStorage()` and throws
// at runtime since `node:async_hooks` is externalized to undefined.
import type { FormatRelativeOptions } from "@plumix/core/i18n";
import { formatDate, formatNumber, formatRelative } from "@plumix/core/i18n";

interface Formatters {
  formatDate: (value: Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatRelative: (value: Date, options?: FormatRelativeOptions) => string;
}

/** Pulls the active Lingui locale and returns the three format helpers
 *  with it baked in, so call sites read `formatters.formatDate(value)`
 *  rather than threading locale through every render. Memoized on
 *  `locale` so consumers can safely include the returned functions in
 *  `useMemo` / `useCallback` dep arrays without invalidating on every
 *  render (which would cascade into re-mount loops on tree-stable
 *  components like Puck's `Layout`). */
export function useFormatters(): Formatters {
  const { i18n } = useLingui();
  const locale = i18n.locale;
  return useMemo<Formatters>(
    () => ({
      formatDate: (value, options) => formatDate(locale, value, options),
      formatNumber: (value, options) => formatNumber(locale, value, options),
      // Default `numeric: "auto"` so the human-friendly forms
      // ("yesterday", "now", "last week") render instead of "1 day
      // ago" / "in 0 seconds". Caller can override via
      // `options.numeric: "always"`.
      formatRelative: (value, options) =>
        formatRelative(locale, value, { numeric: "auto", ...options }),
    }),
    [locale],
  );
}
