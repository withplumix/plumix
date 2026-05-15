import type { MenuLocationOptions, RegisteredMenuLocation } from "./types.js";
import { MenuPluginError } from "../errors.js";

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
    throw MenuPluginError.invalidLocationId({
      id,
      pattern: LOCATION_ID_RE.source,
      maxLength: MAX_LOCATION_ID_LENGTH,
    });
  }
  if (typeof options.label !== "string" || options.label.trim().length === 0) {
    throw MenuPluginError.locationLabelEmpty({ id });
  }
  if (locations.has(id)) {
    throw MenuPluginError.duplicateLocation({ id });
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
