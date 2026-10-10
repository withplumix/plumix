/**
 * Not `Date.UTC`, which remaps years 0–99 to 1900–1999. Callers rely on an
 * out-of-range month or day overflowing.
 */
function utcMidnight(year: number, monthIndex: number, day: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, monthIndex, day);
  return d;
}

/**
 * Half-open `[start, end)` in UTC; `null` when the components aren't a real
 * date, so the caller 404s. `month`/`day` are 1-based.
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
