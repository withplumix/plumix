/** Mock fixtures and non-oRPC paths deliver ISO strings. */
export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
