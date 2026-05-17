import type { BlockRegistry, BlockTransformTo } from "./types.js";

/**
 * Resolve the set of valid transform targets for the block named
 * `source`. The BlockMenu's "Transform to…" submenu renders this
 * list verbatim.
 *
 * Pulls from both sides of the relationship: `source.transforms.to`
 * entries the source spec authored, plus every other block whose
 * `transforms.from` lists `source`. Higher priority wins on dedupe —
 * same target surfacing from both sides keeps the entry whose owning
 * spec declared a higher `transforms.priority`.
 */
export function resolveTransformTargets(
  source: string,
  registry: BlockRegistry,
): readonly BlockTransformTo[] {
  const sourceSpec = registry.get(source);
  if (!sourceSpec) return [];

  interface Entry {
    transform: BlockTransformTo;
    priority: number;
  }
  const byTarget = new Map<string, Entry>();
  const record = (transform: BlockTransformTo, priority: number): void => {
    const existing = byTarget.get(transform.target);
    if (!existing || priority > existing.priority) {
      byTarget.set(transform.target, { transform, priority });
    }
  };

  const sourcePriority = sourceSpec.transforms?.priority ?? 0;
  for (const entry of sourceSpec.transforms?.to ?? []) {
    record(entry, sourcePriority);
  }

  for (const [, candidate] of registry) {
    if (candidate.name === source) continue;
    const acceptsSource = candidate.transforms?.from?.some(
      (rule) => rule.source === source,
    );
    if (!acceptsSource) continue;
    record({ target: candidate.name }, candidate.transforms?.priority ?? 0);
  }

  return Array.from(byTarget.values())
    .filter(({ transform }) => registry.has(transform.target))
    .sort((a, b) => b.priority - a.priority)
    .map(({ transform }) => transform);
}
