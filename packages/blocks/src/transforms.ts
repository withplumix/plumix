import type { BlockShortcutMode, BlockSpec } from "./block-registry.js";

type MapAttrs = (
  attrs: Readonly<Record<string, unknown>>,
) => Readonly<Record<string, unknown>>;

export interface ResolvedTransformTarget {
  readonly target: string;
  readonly mapAttrs?: MapAttrs;
  readonly mode?: BlockShortcutMode;
  readonly priority: number;
}

export function resolveBlockTransforms(
  source: string,
  specs: readonly BlockSpec[],
): readonly ResolvedTransformTarget[] {
  const sourceSpec = specs.find((spec) => spec.name === source);
  if (!sourceSpec) return [];

  const byTarget = new Map<string, ResolvedTransformTarget>();
  const record = (
    target: string,
    mapAttrs: MapAttrs | undefined,
    mode: BlockShortcutMode | undefined,
    priority: number,
  ): void => {
    const existing = byTarget.get(target);
    if (!existing || priority > existing.priority) {
      byTarget.set(target, { target, mapAttrs, mode, priority });
    }
  };

  const sourcePriority = sourceSpec.transforms?.priority ?? 0;
  for (const entry of sourceSpec.transforms?.to ?? []) {
    record(entry.target, entry.mapAttrs, entry.mode, sourcePriority);
  }

  for (const candidate of specs) {
    if (candidate.name === source) continue;
    const fromRule = candidate.transforms?.from?.find(
      (rule) => rule.source === source,
    );
    if (!fromRule) continue;
    record(
      candidate.name,
      fromRule.mapAttrs,
      undefined,
      candidate.transforms?.priority ?? 0,
    );
  }

  const known = new Set(specs.map((spec) => spec.name));
  return Array.from(byTarget.values())
    .filter((entry) => known.has(entry.target))
    .sort((a, b) => b.priority - a.priority);
}
