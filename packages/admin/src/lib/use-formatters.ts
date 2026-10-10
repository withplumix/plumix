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

/** Stable per locale, so the helpers are safe in dependency arrays. */
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
