import type { JsonValue } from "../json.js";
import type { BlockSpecLookup } from "./block-slots.js";
import type { BlockNode } from "./render-block-tree.js";
import { blockSlotKeys } from "./block-slots.js";
import { isBlockNodeArray } from "./render-block-tree.js";

// 12 chars × 64 = 72 bits entropy — ample for React keys with no
// realistic collision risk over a page's edit lifetime. The 64-char
// URL-safe alphabet plus `byte & 63` masking avoids modulo bias.
const ID_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";
const ID_LENGTH = 12;

/** A fresh, collision-resistant block id (the same generator the id rewriter
 *  uses). For new nodes the editor mints directly, e.g. a group wrapper. */
export function freshBlockId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += ID_ALPHABET.charAt(byte & 63);
  }
  return out;
}

/** Fresh ids for every node in `nodes` and in the slots `blocks` declares on
 *  each, so a pasted or duplicated subtree is independent of its source. */
export function rewriteBlockNodeIds(
  nodes: readonly BlockNode[],
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  return nodes.map((node) => {
    const nextAttrs: Record<string, JsonValue> = { ...node.attrs };
    for (const key of blockSlotKeys(node, blocks.get(node.name))) {
      const value = nextAttrs[key];
      if (isBlockNodeArray(value)) {
        nextAttrs[key] = rewriteBlockNodeIds(value, blocks);
      }
    }
    return { ...node, id: freshBlockId(), attrs: nextAttrs };
  });
}
