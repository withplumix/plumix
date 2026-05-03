// Optional helper for coercing a meta value stored by the `date` /
// `datetime` field types into a JS `Date`. Plumix never auto-coerces
// — values cross the wire as ISO strings so consumers can pick their
// own date library (`date-fns`, `dayjs`, `Temporal`) without paying a
// parse cost twice. Reach for this helper when a vanilla `Date` is
// what you want and you're OK with the timezone-loss caveats below.
//
// Returns `null` (never throws) for: `null` / `undefined`, non-string
// values, empty strings, and strings that don't match the
// ISO-date(time) shape `parseMetaDate` recognises. Tolerant by
// design: a future schema migration that switches a field's
// `inputType` shouldn't 500 the editor — bad input rounds to
// "no value" and the renderer shows an empty state.
//
// Caveats:
// - The `time`-only field (`HH:MM`) returns `null` here; a time
//   without a calendar anchor isn't a `Date`. Pair with a `date`
//   field, or parse manually.
// - `datetime` storage is naive local time today. `new Date(string)`
//   interprets bare-local strings in the runtime's timezone, which
//   matches author intent in most authoring contexts; if you need
//   stronger semantics, anchor with `Temporal.ZonedDateTime` instead.

const ISO_DATE_OR_DATETIME =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Coerce a meta value stored by `date` / `datetime` into a `Date`.
 * Returns `null` for any input that isn't a recognisable ISO
 * date(time) string.
 */
export function parseMetaDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!ISO_DATE_OR_DATETIME.test(trimmed)) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}
