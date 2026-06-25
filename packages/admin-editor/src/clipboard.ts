import type { BlockNode } from "@plumix/blocks";
import { isBlockNodeArray } from "@plumix/blocks";

// Envelope written to the system clipboard for block copy/paste. The `kind`
// discriminator lets paste tell our payload apart from arbitrary clipboard
// text (and `version` leaves room to migrate the shape later).
interface ClipboardEnvelope {
  readonly kind: "plumix/blocks";
  readonly version: 1;
  readonly blocks: readonly BlockNode[];
}

/** Serialize blocks to the clipboard text payload. */
export function serializeBlocks(blocks: readonly BlockNode[]): string {
  return JSON.stringify({
    kind: "plumix/blocks",
    version: 1,
    blocks,
  } satisfies ClipboardEnvelope);
}

/** Parse clipboard text back to blocks, or `null` when it isn't our payload. */
export function parseClipboardBlocks(
  text: string,
): readonly BlockNode[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { kind?: unknown }).kind !== "plumix/blocks"
  ) {
    return null;
  }
  // Validate the element shape too (not just that it's an array): the payload
  // is attacker-influenceable, so reject anything that isn't real block nodes.
  const blocks = (parsed as { blocks?: unknown }).blocks;
  return isBlockNodeArray(blocks) ? blocks : null;
}
