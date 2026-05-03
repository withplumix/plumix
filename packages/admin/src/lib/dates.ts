// Shared date helpers. RPC responses come through as `Date` when oRPC's
// serializer has meta entries to re-hydrate them, but mocks and any non-
// oRPC path deliver ISO strings — coerce at the display boundary so column
// cells / labels don't each have to branch on the shape.

export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

const ABSOLUTE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

// Compact "just now" / "Nm ago" / "Nh ago" / "Nd ago" / absolute date
// for older. Used by the users list (last sign-in) and the per-device
// session card. Hoisted here rather than duplicated at each site —
// they should look identical to operators scanning across surfaces.
export function formatRelative(date: Date): string {
  const elapsed = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return "just now";
  if (elapsed < hour) return `${Math.floor(elapsed / minute)}m ago`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)}h ago`;
  if (elapsed < 7 * day) return `${Math.floor(elapsed / day)}d ago`;
  return ABSOLUTE_FORMATTER.format(date);
}
