import type { BlockRegistry, BlockShortcutMode } from "@plumix/blocks";
import { resolveBlockTransforms } from "@plumix/blocks";

export interface TransformOption {
  // Stable identifier for the option — React key + `data-testid` suffix.
  // Multiple transform-scope variations of the same block all share
  // `targetName === sourceName`, so the variation slug is what keeps
  // them distinct.
  readonly key: string;
  readonly targetName: string;
  readonly targetTitle: string;
  readonly mapAttrs?: (
    attrs: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>;
  readonly mode?: BlockShortcutMode;
}

export function availableTransforms(
  sourceName: string,
  registry: BlockRegistry,
): readonly TransformOption[] {
  const resolved = resolveBlockTransforms(sourceName, Array.from(registry));
  const fromTransforms: TransformOption[] = resolved.map((entry) => ({
    key: `to:${entry.target}`,
    targetName: entry.target,
    targetTitle: registry.get(entry.target)?.title ?? entry.target,
    mapAttrs: entry.mapAttrs,
    mode: entry.mode,
  }));
  // Transform-scoped variations surface as same-block transforms. The
  // editor's transform handler dispatches `replace` with `targetName`
  // identical to the source — Puck's reducer treats that as an in-place
  // attr swap. `mapAttrs` overlays the variation's attrs on top of the
  // instance so other props the user set survive the morph.
  const sourceSpec = registry.get(sourceName);
  const variationOptions: TransformOption[] =
    sourceSpec?.variations
      ?.filter((v) => v.scope?.includes("transform"))
      .map((variation) => ({
        key: `variation:${variation.slug}`,
        targetName: sourceName,
        targetTitle: variation.title,
        mapAttrs: (current) => ({ ...current, ...(variation.attrs ?? {}) }),
      })) ?? [];
  return [...variationOptions, ...fromTransforms];
}
