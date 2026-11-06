import { now } from "../../../clock.js";
import { defineShortcode } from "../types.js";

/**
 * Uses the site locale's numeral system (Arabic → ٢٠٢٦). Reads `now()`
 * per render, uncached.
 */
export const yearShortcode = defineShortcode({
  name: "year",
  render: ({ context }) =>
    new Intl.DateTimeFormat(context.locale, { year: "numeric" }).format(now()),
});
