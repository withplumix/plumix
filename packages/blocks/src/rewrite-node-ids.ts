import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";

// 12 chars × 64 = 72 bits entropy — ample for React keys with no
// realistic collision risk over a page's edit lifetime. The 64-char
// URL-safe alphabet plus `byte & 63` masking avoids modulo bias.
const ID_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";
const ID_LENGTH = 12;

function freshId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += ID_ALPHABET.charAt(byte & 63);
  }
  return out;
}

export function rewriteBlockNodeIds(
  nodes: readonly BlockNode[],
): readonly BlockNode[] {
  return nodes.map((node) => {
    const nextAttrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.attrs ?? {})) {
      nextAttrs[key] = isBlockNodeArray(value)
        ? rewriteBlockNodeIds(value)
        : value;
    }
    return { ...node, id: freshId(), attrs: nextAttrs };
  });
}
