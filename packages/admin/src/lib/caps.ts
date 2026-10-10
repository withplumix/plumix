/**
 * Every admin capability check goes through here, so matching rules change in
 * one place.
 */
export function hasCap(capabilities: readonly string[], cap: string): boolean {
  return capabilities.includes(cap);
}
