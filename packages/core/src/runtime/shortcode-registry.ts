import type { ShortcodeRegistry, ShortcodeSpec } from "@plumix/blocks";

/**
 * Merge the three shortcode sources into the registry `expandShortcodes`
 * reads, with last-wins precedence: core < plugin < theme. A theme may
 * deliberately override a plugin's or core's tag; plugin↔plugin collisions
 * are already rejected at registration. Tags are flat and unprefixed to
 * preserve the `[year]` authoring ergonomic.
 */
export function assembleShortcodeRegistry(
  core: readonly ShortcodeSpec[],
  plugin: readonly ShortcodeSpec[],
  theme: readonly ShortcodeSpec[],
): ShortcodeRegistry {
  const map = new Map<string, ShortcodeSpec>();
  for (const spec of [...core, ...plugin, ...theme]) {
    map.set(spec.name, spec);
  }
  return map;
}
