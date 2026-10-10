import type { EntryContent } from "@plumix/core/blocks";
import { blockTextRoster, coreBlocks, countProse } from "@plumix/core/blocks";

const WORDS_PER_MINUTE = 200;

/**
 * No hook exposes the render registry to a theme component, so this counts
 * core blocks only; a plugin block's text doesn't move the estimate.
 */
const CORE_TEXT = blockTextRoster(coreBlocks);

export function readingTime(content: EntryContent | null): number {
  if (!content) return 1;
  const { words } = countProse(content.blocks, CORE_TEXT);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
