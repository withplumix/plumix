// oRPC responses re-hydrate timestamps as `Date` when meta entries are
// present, but mock fixtures and any non-oRPC path deliver ISO strings —
// coerce at the display boundary so column cells / labels don't each
// have to branch on the shape.
export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
