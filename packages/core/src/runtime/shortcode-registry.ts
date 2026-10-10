import type { ShortcodeRegistry, ShortcodeSpec } from "../blocks/index.js";

/**
 * Last-wins: core < plugin < theme. Plugin-to-plugin collisions are rejected
 * earlier, at registration.
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
