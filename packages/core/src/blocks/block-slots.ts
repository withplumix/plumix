import type { BlockSpec } from "./block-registry.js";
import type { BlockNode } from "./render-block-tree.js";

/** Resolves a block name to its registered spec. A `BlockRegistry` is one. */
export interface BlockSpecLookup {
  get(name: string): BlockSpec | undefined;
}

/**
 * The attr keys of `node` that hold child blocks: exactly the inputs its spec
 * declares with `type: "slot"`, in declaration order. The stored values never
 * decide it, because an empty slot and an empty data array are both `[]`. A
 * declared slot is listed whether its value is filled, `[]` or missing.
 *
 * `spec` is `undefined` for an unregistered block, which has no slots.
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
