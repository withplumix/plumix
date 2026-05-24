import type { MenuLocationOptions, RegisteredMenuLocation } from "./types.js";
import { MenuPluginError } from "../errors.js";

/**
 * Module-scoped registry of menu locations populated at boot. The
 * menu RPC's `locations.list` + `locations.assign` procedures read it
 * to validate which location slots a theme has declared. Tests reset
 * state between cases via `clearRegisteredLocations`. A re-registration
 * path for themes (lost when `theme.setup` went away) is a separate
 * follow-up.
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
