import type { BlockRegistry, BlockShortcutMode } from "@plumix/blocks";
import { resolveBlockTransforms } from "@plumix/blocks";

export interface TransformOption {
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
  return resolved.map((entry) => ({
    targetName: entry.target,
    targetTitle: registry.get(entry.target)?.title ?? entry.target,
    mapAttrs: entry.mapAttrs,
    mode: entry.mode,
  }));
}
