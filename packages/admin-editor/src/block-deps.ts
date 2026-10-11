import type { BlockNode, BlockRegistry, LoadedDeps } from "@plumix/core/blocks";
import { collectBlockDepKeys } from "@plumix/core/blocks";

/**
 * Whether the tree declares a key the canvas holds no result for. A key whose
 * loader found nothing is held as `null`, so it doesn't ask again.
 */
export function unresolvedDeps(
  tree: readonly BlockNode[],
  registry: BlockRegistry,
  held: LoadedDeps,
): boolean {
  const keys = collectBlockDepKeys([tree], registry);
  return Object.entries(keys).some(([kind, kindKeys]) =>
    kindKeys.some((key) => !(key in (held[kind] ?? {}))),
  );
}

/** A new object, so React sees a change. */
export function mergeDeps(prior: LoadedDeps, resolved: LoadedDeps): LoadedDeps {
  const next: Record<string, Readonly<Record<string, unknown>>> = {
    ...prior,
  };
  for (const [kind, results] of Object.entries(resolved)) {
    next[kind] = { ...next[kind], ...results };
  }
  return next;
}
