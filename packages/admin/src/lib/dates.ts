// Shared date helpers. RPC responses come through as `Date` when oRPC's
// serializer has meta entries to re-hydrate them, but mocks and any non-
// oRPC path deliver ISO strings — coerce at the display boundary so column
// cells / labels don't each have to branch on the shape.

export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
