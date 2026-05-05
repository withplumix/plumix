import type { MenuLocationOptions, RegisteredMenuLocation } from "./types.js";

/**
 * Module-scoped registry of menu locations. Themes call
 * `registerMenuLocation` from their `setup` callback (the implementation
 * is wired into `ThemeContextExtensions` from the plugin's `provides`),
 * which delegates to `recordLocation` here.
 *
 * Lifetime: populated once during `buildApp`, read for the rest of the
 * process / Worker isolate. The CF Worker model reuses isolates across
 * requests, so this is effectively boot-time-immutable in production.
 *
 * Tests reset between cases via `clearRegisteredLocations`.
 */
const locations = new Map<string, RegisteredMenuLocation>();

const LOCATION_ID_RE = /^[a-z][a-z0-9-]*$/;
const MAX_LOCATION_ID_LENGTH = 64;

export function recordLocation(id: string, options: MenuLocationOptions): void {
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    id.length > MAX_LOCATION_ID_LENGTH ||
    !LOCATION_ID_RE.test(id)
  ) {
    throw new Error(
      `registerMenuLocation: id "${id}" is invalid. Location ids must ` +
        `match /${LOCATION_ID_RE.source}/ and be 1–${MAX_LOCATION_ID_LENGTH} chars.`,
    );
  }
  if (typeof options.label !== "string" || options.label.trim().length === 0) {
    throw new Error(
      `registerMenuLocation("${id}"): \`label\` is required and must be a non-empty, non-whitespace string.`,
    );
  }
  if (locations.has(id)) {
    throw new Error(
      `registerMenuLocation: location "${id}" is already registered. ` +
        `Each location id must be unique across themes.`,
    );
  }
  locations.set(id, {
    id,
    label: options.label,
    description: options.description,
  });
}

export function getRegisteredLocations(): ReadonlyMap<
  string,
  RegisteredMenuLocation
> {
  return locations;
}

/** Test-only: reset state between cases. Production never calls this. */
export function clearRegisteredLocations(): void {
  locations.clear();
}
