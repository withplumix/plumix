// PROTOTYPE — throwaway. See README.md.
//
// Minute-granularity 5-field cron matcher, UTC. No dependency: the question is
// whether hand-rolling is viable, so this is the honest size of it.

const FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "dayOfMonth", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "dayOfWeek", min: 0, max: 7 }, // 0 and 7 are both Sunday
];

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const DAYS = ["sun","mon","tue","wed","thu","fri","sat"];

function parseField(raw, field) {
  const set = new Set();
  for (const part of raw.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    if (stepPart !== undefined && !/^\d+$/.test(stepPart)) {
      throw new Error(`bad step "${stepPart}" in ${field.name} field "${raw}"`);
    }
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (step === 0) throw new Error(`zero step in ${field.name} field "${raw}"`);

    let from;
    let to;
    if (rangePart === "*") {
      from = field.min;
      to = field.max;
    } else {
      const [a, b] = rangePart.split("-");
      from = named(a, field);
      to = b === undefined ? (stepPart === undefined ? from : field.max) : named(b, field);
    }
    if (from > to) throw new Error(`descending range "${rangePart}" in ${field.name}`);
    for (let v = from; v <= to; v += step) set.add(v);
  }
  return set;
}

function named(token, field) {
  const lower = token.toLowerCase();
  let n;
  if (field.name === "month" && MONTHS.includes(lower)) n = MONTHS.indexOf(lower) + 1;
  else if (field.name === "dayOfWeek" && DAYS.includes(lower)) n = DAYS.indexOf(lower);
  else if (/^\d+$/.test(token)) n = Number(token);
  else throw new Error(`bad value "${token}" in ${field.name} field`);
  if (n < field.min || n > field.max) {
    throw new Error(`"${token}" out of range ${field.min}-${field.max} in ${field.name}`);
  }
  return n;
}

/** Throws on anything it cannot match — the caller turns that into a boot failure. */
export function parseCron(expression) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `cron "${expression}" has ${parts.length} field(s); Plumix on Node supports the 5-field form "minute hour day-of-month month day-of-week"`,
    );
  }
  const sets = parts.map((part, i) => parseField(part, FIELDS[i]));
  // Standard cron: when both day-of-month and day-of-week are restricted the
  // match is OR, not AND.
  const domRestricted = parts[2] !== "*";
  const dowRestricted = parts[4] !== "*";
  const dow = sets[4].has(7) ? new Set([...sets[4], 0]) : sets[4];
  return {
    expression,
    matches(date) {
      if (!sets[0].has(date.getUTCMinutes())) return false;
      if (!sets[1].has(date.getUTCHours())) return false;
      if (!sets[3].has(date.getUTCMonth() + 1)) return false;
      const domHit = sets[2].has(date.getUTCDate());
      const dowHit = dow.has(date.getUTCDay());
      if (domRestricted && dowRestricted) return domHit || dowHit;
      if (domRestricted) return domHit;
      if (dowRestricted) return dowHit;
      return true;
    },
  };
}
