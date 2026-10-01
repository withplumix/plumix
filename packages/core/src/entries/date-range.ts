// Midnight UTC for the given components, via `setUTCFullYear` rather than
// `Date.UTC`/`new Date(y, …)` — the latter two remap a 0–99 year to 1900–1999,
// which would send `/0050` to 1950. `setUTCFullYear` takes the literal year and
// still overflows an out-of-range month/day, which the callers rely on.
function utcMidnight(year: number, monthIndex: number, day: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, monthIndex, day);
  return d;
}

/**
 * The half-open `[start, end)` UTC instant range a `/YYYY[/MM[/DD]]` archive
 * covers, or `null` when the components don't form a real date (month 13,
 * Feb 30, …) so the caller 404s. `month`/`day` are 1-based; `null` = a coarser
 * granularity (a year has `month`/`day` null). Shared by the date-archive
 * resolver and the date feed so both agree on boundaries and validation.
 */
export function dateRange(
  year: number,
  month: number | null,
  day: number | null,
): { readonly start: Date; readonly end: Date } | null {
  if (month === null) {
    return { start: utcMidnight(year, 0, 1), end: utcMidnight(year + 1, 0, 1) };
  }
  if (month < 1 || month > 12) return null;
  if (day === null) {
    return {
      start: utcMidnight(year, month - 1, 1),
      end: utcMidnight(year, month, 1),
    };
  }
  const start = utcMidnight(year, month - 1, day);
  // An out-of-range day overflows into the next month; reject when the
  // round-trip doesn't match, catching Feb 30, Apr 31, etc.
  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== day
  ) {
    return null;
  }
  return { start, end: utcMidnight(year, month - 1, day + 1) };
}
