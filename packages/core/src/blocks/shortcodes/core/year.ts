import { defineShortcode } from "../types.js";

/**
 * `[year]` → the current year in the site's locale and numeral system
 * (Arabic locale → ٢٠٢٦). Reads `new Date()` directly: public HTML renders
 * fresh per request, so the year re-evaluates every render with no cache.
 */
export const yearShortcode = defineShortcode({
  name: "year",
  render: ({ context }) =>
    new Intl.DateTimeFormat(context.locale, { year: "numeric" }).format(
      new Date(),
    ),
});
