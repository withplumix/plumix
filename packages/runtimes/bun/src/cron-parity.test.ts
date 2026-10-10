import { parseCron } from "plumix/runtime";
import { describe, expect, test } from "vitest";

const MINUTE_MS = 60_000;
/** Two years of minutes: every expression below fires well inside one. */
const HORIZON_MINUTES = 2 * 366 * 24 * 60;

/**
 * Core's next fire time strictly after `from`, found by walking its matcher.
 */
function coreNext(expression: string, from: Date): Date {
  const schedule = parseCron(expression);
  const start = Math.floor(from.getTime() / MINUTE_MS) + 1;
  for (let minute = start; minute < start + HORIZON_MINUTES; minute++) {
    const at = new Date(minute * MINUTE_MS);
    if (schedule.matches(at)) return at;
  }
  throw new Error(`"${expression}" never fires within the horizon`);
}

/**
 * Starts that straddle the boundaries a cron engine can get wrong: a leap
 * day, a month end, a year end, and a mid-week afternoon.
 */
const STARTS = [
  "2026-01-01T00:00:00Z",
  "2026-09-29T13:37:00Z",
  "2027-12-31T23:59:00Z",
  "2028-02-28T12:00:00Z",
];

/**
 * Ten successive firings from each start, so a rule that only goes wrong on
 * the second or later occurrence still shows.
 */
const FIRINGS = 10;

function firings(
  expression: string,
  next: (from: Date) => Date,
): readonly string[] {
  return STARTS.flatMap((start) => {
    const out: string[] = [];
    let from = new Date(start);
    for (let i = 0; i < FIRINGS; i++) {
      from = next(from);
      out.push(from.toISOString());
    }
    return out;
  });
}

const bunNext = (expression: string) => (from: Date) =>
  Bun.cron.parse(expression, from, { tz: "UTC" }) ?? new Date(Number.NaN);

/** Every construct core's dialect accepts. */
const AGREES = [
  // Wildcards and plain values
  "* * * * *",
  "30 4 * * *",
  "0 0 1 1 *",
  // Weekday names, either case
  "0 9 * * MON",
  "0 9 * * sun",
  // Month names
  "0 0 1 JUN *",
  "0 0 15 dec *",
  // Ranges, numeric and named
  "0 9-17 * * *",
  "0 0 * * MON-FRI",
  "0 0 1 JAN-MAR *",
  // Steps: over the whole field, from a start, and over a range
  "*/5 * * * *",
  "5/10 * * * *",
  "0 0-23/6 * * *",
  "0 0 * * MON-FRI/2",
  "0 0 1 JAN-DEC/3 *",
  // Lists, including lists of ranges and steps
  "0,15,30,45 * * * *",
  "0 0 * * SAT,SUN",
  "0 8-10,14-16/2 * * *",
  // Vixie day rule: both day fields restricted OR together
  "0 0 1 * MON",
  "0 0 1,15 * FRI",
  // Vixie day rule: a `*`-led field leaves the other one deciding alone
  "0 0 */2 * *",
  "0 0 * * */2",
  "0 0 13 * *",
];

// Vixie cron ANDs `*/2` with a restricted weekday; Bun 1.4 ORs them, so these
// fire on days core does not. That is why core's scheduler drives jobs on Bun.
const DIVERGES = ["0 0 */2 * MON", "0 0 1 * */2", "0 0 */10 * SAT,SUN"];

describe("Bun.cron.parse against core's cron dialect, in UTC", () => {
  test.each(AGREES)("agrees on %s", (expression) => {
    expect(firings(expression, bunNext(expression))).toEqual(
      firings(expression, (from) => coreNext(expression, from)),
    );
  });

  test.each(DIVERGES)("diverges on %s", (expression) => {
    expect(firings(expression, bunNext(expression))).not.toEqual(
      firings(expression, (from) => coreNext(expression, from)),
    );
  });
});
