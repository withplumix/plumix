import type { MenuLocationOptions, RegisteredMenuLocation } from "./types.js";
import { MenuPluginError } from "../errors.js";

/**
 * Module-scoped registry of menu locations. Populated by the menu
 * plugin's `setup` from `menu({ locations })`, which resets it first —
 * setup re-runs within one module lifetime (dev rebuilds boot the app
 * more than once), so the registry must reflect the latest build's
 * declarations, not an additive union of every boot. The menu RPC's
 * `locations.list` + `locations.assign` procedures read it to validate
 * which location slots the consumer has declared.
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

/**
 * Reset the registry. The plugin's `setup` calls this before
 * re-populating so each build declaratively owns the full location
 * set — a removed config entry actually disappears. Tests use it to
 * isolate cases.
 */
export function clearRegisteredLocations(): void {
  locations.clear();
}
