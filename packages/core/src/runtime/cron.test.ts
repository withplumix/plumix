import { describe, expect, test } from "vitest";

import { parseCron } from "./cron.js";

const at = (iso: string): Date => new Date(iso);

describe("parseCron", () => {
  test("matches a schedule's own minute and rejects the ones between", () => {
    const every5 = parseCron("*/5 * * * *");
    expect(every5.matches(at("2026-09-07T04:05:00Z"))).toBe(true);
    expect(every5.matches(at("2026-09-07T04:06:00Z"))).toBe(false);
  });

  test("matches in UTC, whatever the host's zone", () => {
    // 03:00 UTC is the schedule; a host in UTC+2 sees 05:00 local at that
    // instant and must still fire.
    const daily = parseCron("0 3 * * *");
    expect(daily.matches(at("2026-09-07T03:00:00Z"))).toBe(true);
    expect(daily.matches(at("2026-09-07T01:00:00Z"))).toBe(false);
  });

  test("reads lists, ranges and stepped ranges", () => {
    const listed = parseCron("15,45 * * * *");
    expect(listed.matches(at("2026-09-07T09:45:00Z"))).toBe(true);
    expect(listed.matches(at("2026-09-07T09:30:00Z"))).toBe(false);

    const stepped = parseCron("0 9-17/4 * * MON-FRI");
    expect(stepped.matches(at("2026-09-07T13:00:00Z"))).toBe(true);
    expect(stepped.matches(at("2026-09-07T14:00:00Z"))).toBe(false);
  });

  test("reads month and weekday names, case-insensitively", () => {
    const newYear = parseCron("0 0 1 JAN *");
    expect(newYear.matches(at("2027-01-01T00:00:00Z"))).toBe(true);
    expect(newYear.matches(at("2027-02-01T00:00:00Z"))).toBe(false);

    const sundays = parseCron("0 0 * * sun");
    expect(sundays.matches(at("2026-09-06T00:00:00Z"))).toBe(true);
    expect(sundays.matches(at("2026-09-07T00:00:00Z"))).toBe(false);
  });

  test("treats a day field beginning with * as unrestricted, as Vixie cron does", () => {
    // `*/2` is a step over every day, not a restriction, so this fires on
    // Mondays only — not "every second day OR any Monday".
    const stepped = parseCron("0 0 */2 * MON");
    expect(stepped.matches(at("2026-09-07T00:00:00Z"))).toBe(true); // Monday
    expect(stepped.matches(at("2026-09-05T00:00:00Z"))).toBe(false); // odd, not Monday
  });

  test("ORs day-of-month against day-of-week when both are restricted", () => {
    // Standard cron: "the 1st, or any Monday" — not "Mondays that are the 1st".
    const either = parseCron("0 0 1 * MON");
    expect(either.matches(at("2026-09-01T00:00:00Z"))).toBe(true); // the 1st
    expect(either.matches(at("2026-09-07T00:00:00Z"))).toBe(true); // a Monday
    expect(either.matches(at("2026-09-02T00:00:00Z"))).toBe(false); // neither
  });
});

describe("parseCron rejects what is not portable across runtimes", () => {
  test("a numeric day-of-week, naming the abbreviation to use instead", () => {
    // Cloudflare reads 1 as Sunday, Unix cron reads it as Monday. Rather than
    // pick a side and silently move someone's job by a day, refuse the digit.
    expect(() => parseCron("0 0 * * 1")).toThrow(/day-of-week/i);
    expect(() => parseCron("0 0 * * 1-5")).toThrow(/day-of-week/i);

    // Both readings are named and neither is picked: suggesting one would hand
    // back the off-by-one this rejection exists to prevent.
    expect(() => parseCron("0 0 * * 1")).toThrow(/Unix cron reads it as MON/);
    expect(() => parseCron("0 0 * * 1")).toThrow(/Cloudflare as SUN/);
  });

  test("the Quartz extensions Cloudflare takes but Unix cron does not", () => {
    expect(() => parseCron("0 0 L * *")).toThrow(/\bL\b/);
    expect(() => parseCron("0 0 LW * *")).toThrow(/portable/i);
    expect(() => parseCron("0 0 * * MON#2")).toThrow(/portable/i);
  });

  test("the wrong number of fields, naming the form it wants", () => {
    expect(() => parseCron("*/5 * * *")).toThrow(/5 fields/);
    expect(() => parseCron("0 3 * * * *")).toThrow(/5 fields/);
    expect(() => parseCron("@daily")).toThrow(/5 fields/);
  });

  test("a weekday range that wraps the week, pointing at a list", () => {
    // "low to high" would be SUN-SAT, which is every day — not what the author
    // of SAT-SUN meant.
    expect(() => parseCron("0 0 * * SAT-SUN")).toThrow(/list/);
    expect(() => parseCron("0 0 * * SAT-SUN")).toThrow(/SAT,SUN/);
  });

  test("values outside a field's range, and malformed steps or ranges", () => {
    expect(() => parseCron("0 99 * * *")).toThrow(/hour/);
    expect(() => parseCron("0 0 32 * *")).toThrow(/day-of-month/);
    expect(() => parseCron("*/0 * * * *")).toThrow(/step/);
    expect(() => parseCron("5-1 * * * *")).toThrow(/range/);
    expect(() => parseCron("")).toThrow(/5 fields/);
  });
});
