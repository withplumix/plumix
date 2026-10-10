import type { BlockNode, BlockSpec } from "@plumix/core/blocks";
import {
  blockTextRoster,
  extractBlockText,
  isBlockNodeArray,
} from "@plumix/core/blocks";

const MAX_LENGTH = 48;

/** Excludes nested blocks' text, which have rows of their own. */
export function blockExcerpt(
  node: BlockNode,
  spec: BlockSpec | undefined,
): string | null {
  if (!spec) return null;
  const own: BlockNode = {
    ...node,
    attrs: Object.fromEntries(
      Object.entries(node.attrs ?? {}).filter(
        ([, value]) => !isBlockNodeArray(value),
      ),
    ),
  };
  const text = extractBlockText([own], blockTextRoster([spec]))
    .replace(/\s+/g, " ")
    .trim();
  if (text.length === 0) return null;
  return text.length > MAX_LENGTH
    ? `${text.slice(0, MAX_LENGTH - 1).trimEnd()}…`
    : text;
}
