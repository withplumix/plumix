import type { BlockSpec } from "./block-registry.js";
import type { BlockNode } from "./render-block-tree.js";

/** Resolves a block name to its registered spec. A `BlockRegistry` is one. */
export interface BlockSpecLookup {
  get(name: string): BlockSpec | undefined;
}

/**
 * Decided by the spec's `slot` inputs, never the stored values: an empty slot
 * and an empty data array are both `[]`.
 */
export function blockSlotKeys(
  node: BlockNode,
  spec: BlockSpec | undefined,
): readonly string[] {
  const keys: string[] = [];
  for (const input of spec?.inputs ?? []) {
    if (input.type === "slot") keys.push(input.name);
  }
  return keys;
}
