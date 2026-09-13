import type { MenuLocationOptions, RegisteredMenuLocation } from "./types.js";
import { MenuPluginError } from "../errors.js";

const LOCATION_ID_RE = /^[a-z][a-z0-9-]*$/;
const MAX_LOCATION_ID_LENGTH = 64;

/** The navigation slots one install declared, validated and keyed by id. */
export function declareLocations(
  declared: Readonly<Record<string, MenuLocationOptions>>,
): ReadonlyMap<string, RegisteredMenuLocation> {
  const locations = new Map<string, RegisteredMenuLocation>();
  for (const [id, options] of Object.entries(declared)) {
    if (
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
    if (
      typeof options.label !== "string" ||
      options.label.trim().length === 0
    ) {
      throw MenuPluginError.locationLabelEmpty({ id });
    }
    locations.set(id, {
      id,
      label: options.label,
      description: options.description,
    });
  }
  return locations;
}
