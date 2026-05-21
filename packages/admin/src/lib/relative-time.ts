const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365;

const RTF = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < MINUTE) return RTF.format(seconds, "second");
  if (abs < HOUR) return RTF.format(Math.round(seconds / MINUTE), "minute");
  if (abs < DAY) return RTF.format(Math.round(seconds / HOUR), "hour");
  if (abs < WEEK) return RTF.format(Math.round(seconds / DAY), "day");
  if (abs < MONTH) return RTF.format(Math.round(seconds / WEEK), "week");
  if (abs < YEAR) return RTF.format(Math.round(seconds / MONTH), "month");
  return RTF.format(Math.round(seconds / YEAR), "year");
}
