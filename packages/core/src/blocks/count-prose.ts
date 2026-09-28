import type { BlockTextRoster } from "./block-text.js";
import type { BlockNode } from "./render-block-tree.js";
import { collectBlockText } from "./block-text.js";

export interface ProseCount {
  readonly words: number;
  readonly characters: number;
}

// CJK / Japanese / Korean ranges — scripts without inter-word spaces, so
// each character counts as one "word" (matching Word/Google Docs).
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/gu;

function countSegment(text: string): ProseCount {
  const cjk = text.match(CJK)?.length ?? 0;
  const spaced = text.replace(CJK, " ").trim();
  const spacedWords = spaced ? spaced.split(/\s+/).length : 0;
  return {
    words: cjk + spacedWords,
    // Spread to count by code point so astral chars (emoji) count as one.
    characters: [...text].length,
  };
}

// Reading length over the same roster the text extractor walks, filtered to
// the inputs declared as body copy — a code listing, a control's label or an
// image's alt attribute is findable but is not read at prose speed.
//
// Sums per segment rather than joining: a join separator would inflate the
// character total by one phantom char per block boundary.
export function countProse(
  blocks: readonly BlockNode[],
  roster: BlockTextRoster,
): ProseCount {
  let words = 0;
  let characters = 0;
  for (const segment of collectBlockText(blocks, roster)) {
    if (!segment.prose) continue;
    const count = countSegment(segment.text);
    words += count.words;
    characters += count.characters;
  }
  return { words, characters };
}
