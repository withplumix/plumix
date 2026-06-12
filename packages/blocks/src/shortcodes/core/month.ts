import { defineShortcode } from "../types.js";

const MONTH_FORMATS = ["long", "short", "numeric"] as const;
type MonthFormat = (typeof MONTH_FORMATS)[number];

function isMonthFormat(value: string): value is MonthFormat {
  return (MONTH_FORMATS as readonly string[]).includes(value);
}

function resolveFormat(value: string | undefined): MonthFormat {
  return value !== undefined && isMonthFormat(value) ? value : "long";
}

/**
 * `[month format="long|short|numeric"]` → the current month in the site's
 * locale, default `long`. Reads `new Date()` directly (fresh per request).
 */
export const monthShortcode = defineShortcode({
  name: "month",
  render: ({ atts, context }) =>
    new Intl.DateTimeFormat(context.locale, {
      month: resolveFormat(atts.format),
    }).format(new Date()),
});
