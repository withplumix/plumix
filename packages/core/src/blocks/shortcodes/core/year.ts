import { defineShortcode } from "../types.js";

/**
 * Uses the site locale's numeral system (Arabic → ٢٠٢٦). Reads `new Date()`
 * per render, uncached.
 */
export const yearShortcode = defineShortcode({
  name: "year",
  render: ({ context }) =>
    new Intl.DateTimeFormat(context.locale, { year: "numeric" }).format(
      new Date(),
    ),
});
