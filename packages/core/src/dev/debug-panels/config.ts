/**
 * Every debug panel a site can name in `dev.panels`. Core seeds its five;
 * a plugin adds its own from the module that registers the panel:
 *
 * ```ts
 * declare module "plumix" {
 *   interface DebugPanelRegistry {
 *     og: true;
 *   }
 * }
 * ```
 *
 * The extension point is open and the configuration surface is closed:
 * {@link DebugPanel.id} stays `string`, so anyone may contribute a panel
 * through the `debug:panels` filter, but only a registered id is *nameable*
 * in config — which is what turns a mistyped panel name from a silent no-op
 * into a compile error. A panel whose plugin ships no augmentation is still
 * removable through the filter.
 *
 * The value type carries nothing; the key is the whole declaration.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface DebugPanelRegistry extends Record<CoreDebugPanelId, true> {}

/**
 * The ids of the panels core registers. A runtime list rather than five
 * interface members so a test can hold it equal to what `registerCoreDebugPanels`
 * actually contributes — a registry key with no panel behind it would be the
 * same silent no-op this registry exists to rule out.
 */
export const CORE_DEBUG_PANEL_IDS = [
  "app",
  "request",
  "database",
  "template",
  "timeline",
] as const;

type CoreDebugPanelId = (typeof CORE_DEBUG_PANEL_IDS)[number];

type DebugPanelId = keyof DebugPanelRegistry;

/**
 * `dev.panels`: which panels this site shows. An absent key shows the panel,
 * so the default is every panel a plugin contributed rather than a list the
 * author has to maintain as they install things.
 */
export type DebugPanelsInput = Partial<Readonly<Record<DebugPanelId, boolean>>>;

/**
 * The ids {@link collectDebugPanels} drops, as a Set for O(1) `.has(id)` at
 * collect time. Both dev surfaces resolve it from the same input, which is why
 * it belongs to the panel layer and not to either of them.
 */
export function disabledPanelIds(
  input: DebugPanelsInput = {},
): ReadonlySet<string> {
  const disabled = new Set<string>();
  // An absent key — or one written as `undefined` — shows the panel, so the
  // test below has to stay a comparison. `Object.entries` drops the
  // `undefined` that `Partial` put on every value, and the annotation puts it
  // back; without it the comparison reads as redundant and lint rejects it.
  const entries: readonly (readonly [string, boolean | undefined])[] =
    Object.entries(input);
  for (const [id, shown] of entries) {
    if (shown === false) disabled.add(id);
  }
  return disabled;
}
