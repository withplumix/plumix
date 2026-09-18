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
export interface DebugPanelRegistry {
  app: true;
  request: true;
  database: true;
  template: true;
  timeline: true;
}

export type DebugPanelId = keyof DebugPanelRegistry;

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
  input: DebugPanelsInput | undefined,
): ReadonlySet<string> {
  const disabled = new Set<string>();
  // `Object.entries` drops the `undefined` that `Partial` put on every value,
  // and only an explicit `false` hides a panel — a key written as `undefined`
  // is enumerated but means nothing, so the comparison has to stay a
  // comparison rather than become a truthiness test.
  const entries: readonly (readonly [string, boolean | undefined])[] =
    Object.entries(input ?? {});
  for (const [id, shown] of entries) {
    if (shown === false) disabled.add(id);
  }
  return disabled;
}
