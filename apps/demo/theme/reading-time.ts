import type { EntryContent } from "@plumix/blocks";
import { countProse } from "@plumix/blocks";

const WORDS_PER_MINUTE = 200;

export function readingTime(content: EntryContent | null): number {
  if (!content) return 1;
  const { words } = countProse(content.blocks);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
