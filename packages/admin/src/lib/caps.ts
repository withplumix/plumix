/**
 * Single grep target for every capability check in the admin. Centralising
 * it lets us add wildcard matching (`content:*`), role shortcuts, or a
 * session-hash-keyed cache in one place rather than threading the change
 * through every route guard and component.
 *
 * Accepts the capability array directly rather than the full user object
 * so it composes with both sources we have:
 *   - `context.user.capabilities` (route `beforeLoad` contexts)
 *   - `capabilities` (threaded into shell components without the user)
 */
export function hasCap(capabilities: readonly string[], cap: string): boolean {
  return capabilities.includes(cap);
}
