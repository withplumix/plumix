import type { BlockRegistry, BlockSpec } from "./block-registry.js";

interface AllowedBlocksInput {
  /** Always allowed, named or not. */
  readonly themeBlocks: readonly BlockSpec[];
  /** The theme's list; every registered block when omitted. */
  readonly allowedBlocks?: readonly string[];
}

/**
 * Resolved once per site, for both the server's content check and the
 * manifest, so no reader recomputes it. A slot-bound block follows its parent;
 * listing it alone has no effect.
 */
export function resolveAllowedBlocks(
  registry: BlockRegistry,
  { themeBlocks, allowedBlocks }: AllowedBlocksInput,
): readonly string[] {
  const specs = [...registry];
  if (!allowedBlocks) return specs.map((spec) => spec.name);

  const parents = slotParents(specs);
  const allowed = new Set(themeBlocks.map((spec) => spec.name));
  for (const name of allowedBlocks) {
    if (registry.has(name) && !parents.has(name)) allowed.add(name);
  }
  // Until no child is added: a table allows its rows, and a row its cells.
  let grew = true;
  while (grew) {
    grew = false;
    for (const [child, ofChild] of parents) {
      if (allowed.has(child)) continue;
      if (ofChild.some((parent) => allowed.has(parent))) {
        allowed.add(child);
        grew = true;
      }
    }
  }
  return specs.filter((spec) => allowed.has(spec.name)).map((s) => s.name);
}

/** Each slot-bound block's name, with the blocks it can sit under. */
function slotParents(
  specs: readonly BlockSpec[],
): ReadonlyMap<string, readonly string[]> {
  const namedBy = new Map<string, string[]>();
  for (const spec of specs) {
    for (const input of spec.inputs ?? []) {
      for (const child of input.allowedBlocks ?? []) {
        const of = namedBy.get(child) ?? [];
        namedBy.set(child, [...of, spec.name]);
      }
    }
  }
  const parents = new Map<string, readonly string[]>();
  for (const spec of specs) {
    if (spec.requiresParent) {
      parents.set(spec.name, spec.requiresParent);
    } else if (spec.inserter === false && namedBy.has(spec.name)) {
      parents.set(spec.name, namedBy.get(spec.name) ?? []);
    }
  }
  return parents;
}
