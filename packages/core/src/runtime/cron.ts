/**
 * The cron dialect Plumix speaks, and the only one it speaks.
 *
 * Runtimes disagree about cron. Cloudflare reads the day-of-week field
 * Quartz-style — `1-7`, where 1 is Sunday — and also takes `L`, `W` and `#`;
 * Unix cron reads `0-6`, where 0 is Sunday. So `0 0 * * 1` means Sunday on one
 * and Monday on the other. Rather than pick a side and silently move a site's
 * job by a day when its runtime changes, this parser accepts only the subset
 * that means the same thing everywhere: weekdays and months by name, and no
 * Quartz extensions. Everything it rejects, it rejects loudly at boot.
 */

interface Field {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  /** Names accepted in place of a number, lowest value first. */
  readonly names?: readonly string[];
  /** Set when a bare number would mean different days on different runtimes. */
  readonly numbersAreAmbiguous?: boolean;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const MINUTE: Field = { name: "minute", min: 0, max: 59 };
const HOUR: Field = { name: "hour", min: 0, max: 23 };
const DAY_OF_MONTH: Field = { name: "day-of-month", min: 1, max: 31 };
const MONTH: Field = { name: "month", min: 1, max: 12, names: MONTHS };
const DAY_OF_WEEK: Field = {
  name: "day-of-week",
  min: 0,
  max: 6,
  names: WEEKDAYS,
  numbersAreAmbiguous: true,
};

const FIELD_COUNT = 5;

const FORM = "minute hour day-of-month month day-of-week";

export class CronSyntaxError extends Error {
  readonly expression: string;

  constructor(expression: string, detail: string) {
    super(`Invalid cron "${expression}": ${detail}`);
    this.name = "CronSyntaxError";
    this.expression = expression;
  }
}

export interface CronSchedule {
  readonly expression: string;
  /** Whether this schedule fires at `date`'s UTC minute. */
  matches(date: Date): boolean;
}

/**
 * Parse a cron expression, or throw {@link CronSyntaxError} naming the fix.
 * Matching is always UTC — the runtime a site deploys to sets the process
 * timezone, and a schedule must not move with it.
 */
export function parseCron(expression: string): CronSchedule {
  const parts = expression.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== FIELD_COUNT) {
    throw new CronSyntaxError(
      expression,
      `expected 5 fields ("${FORM}"), found ${String(parts.length)}`,
    );
  }
  // The length check above fixes all five, so the defaults never apply.
  const [
    minuteRaw = "",
    hourRaw = "",
    domRaw = "",
    monthRaw = "",
    dowRaw = "",
  ] = parts;

  const minutes = parseField(expression, minuteRaw, MINUTE);
  const hours = parseField(expression, hourRaw, HOUR);
  const daysOfMonth = parseField(expression, domRaw, DAY_OF_MONTH);
  const months = parseField(expression, monthRaw, MONTH);
  const daysOfWeek = parseField(expression, dowRaw, DAY_OF_WEEK);

  // Standard cron: when both day fields are restricted the match is an OR —
  // "the 1st, or any Monday", not "Mondays that fall on the 1st".
  // Vixie cron decides this on the field's first character, so `*/2` counts as
  // unrestricted and the two day fields AND. Matching that keeps an expression
  // meaning the same thing here as in the crontab it was copied from.
  const domRestricted = !domRaw.startsWith("*");
  const dowRestricted = !dowRaw.startsWith("*");

  return {
    expression,
    matches(date) {
      if (!minutes.has(date.getUTCMinutes())) return false;
      if (!hours.has(date.getUTCHours())) return false;
      if (!months.has(date.getUTCMonth() + 1)) return false;
      const dom = daysOfMonth.has(date.getUTCDate());
      const dow = daysOfWeek.has(date.getUTCDay());
      if (domRestricted && dowRestricted) return dom || dow;
      if (domRestricted) return dom;
      if (dowRestricted) return dow;
      return true;
    },
  };
}

function parseField(
  expression: string,
  raw: string,
  field: Field,
): ReadonlySet<number> {
  const values = new Set<number>();
  for (const term of raw.split(",")) {
    const [range, step] = splitStep(expression, term, field);
    const { from, to } = parseRange(expression, range, field, step !== 1);
    for (let value = from; value <= to; value += step) values.add(value);
  }
  return values;
}

function splitStep(
  expression: string,
  term: string,
  field: Field,
): [range: string, step: number] {
  const slash = term.indexOf("/");
  if (slash === -1) return [term, 1];
  const raw = term.slice(slash + 1);
  if (!/^\d+$/.test(raw) || Number(raw) === 0) {
    throw new CronSyntaxError(
      expression,
      `"${raw}" is not a step in the ${field.name} field; a step is a whole number above zero`,
    );
  }
  return [term.slice(0, slash), Number(raw)];
}

function parseRange(
  expression: string,
  range: string,
  field: Field,
  stepped: boolean,
): { from: number; to: number } {
  // `*/2` and `5/2` both run to the end of the field; a bare `5` is just 5.
  if (range === "*") return { from: field.min, to: field.max };
  const dash = range.indexOf("-");
  if (dash === -1) {
    const only = parseValue(expression, range, field);
    return { from: only, to: stepped ? field.max : only };
  }
  const from = parseValue(expression, range.slice(0, dash), field);
  const to = parseValue(expression, range.slice(dash + 1), field);
  if (from > to) {
    // "low to high" is no help for a weekend: `SUN-SAT` is every day, so a
    // range that wraps the week has to become a list.
    const fix = field.names
      ? `write it as a list, e.g. "${range.split("-").join(",").toUpperCase()}"`
      : "write it low to high";
    throw new CronSyntaxError(
      expression,
      `"${range}" is a descending range in the ${field.name} field; ${fix}`,
    );
  }
  return { from, to };
}

function parseValue(expression: string, token: string, field: Field): number {
  const named = field.names?.indexOf(token.toLowerCase()) ?? -1;
  if (named !== -1) return named + field.min;

  if (!/^\d+$/.test(token)) {
    throw new CronSyntaxError(expression, unportable(token, field));
  }
  if (field.numbersAreAmbiguous) {
    // The whole reason this parser exists. Name the replacement so the fix is
    // the error message, not a docs hunt.
    // Deliberately no single replacement: Cloudflare reads this field 1-7 with
    // 1 = Sunday, Unix cron 0-6 with 0 = Sunday, so the two readings differ by
    // a day. Naming one would hand back the very off-by-one this rejects.
    const digit = Number(token);
    const unix = WEEKDAYS[digit];
    const quartz = WEEKDAYS[digit - 1];
    const readings =
      unix === undefined && quartz === undefined
        ? ""
        : ` — Unix cron reads it as ${label(unix)} and Cloudflare as ${label(quartz)}, so say which you meant`;
    throw new CronSyntaxError(
      expression,
      `"${token}" is a number in the ${field.name} field, which means a different day on different runtimes${readings}. Use ${WEEKDAYS.map((d) => d.toUpperCase()).join(", ")}`,
    );
  }
  const value = Number(token);
  if (value < field.min || value > field.max) {
    throw new CronSyntaxError(
      expression,
      `"${token}" is outside ${String(field.min)}-${String(field.max)} in the ${field.name} field`,
    );
  }
  return value;
}

/** Names a weekday index, or says there is no such day. */
function label(day: string | undefined): string {
  return day === undefined ? "no day at all" : day.toUpperCase();
}

function unportable(token: string, field: Field): string {
  const quartz = [...token.toUpperCase()].find((char) => "LW#".includes(char));
  if (quartz !== undefined) {
    return `"${token}" uses ${quartz}, which is not portable across runtimes — Cloudflare accepts it and Node does not. Use a plain ${field.name} value`;
  }
  const names = field.names
    ? `; ${field.name} accepts ${field.names.map((n) => n.toUpperCase()).join(", ")}`
    : "";
  return `"${token}" is not a value in the ${field.name} field${names}`;
}
