import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";

export interface ProseCount {
  readonly words: number;
  readonly characters: number;
}

// Prose-bearing attrs by block name. `html: true` means the value is an
// HTML string whose tags must be stripped before counting; otherwise the
// value is plain text. Non-prose blocks (code, buttons, separators, raw
// html) are deliberately excluded from the reading-length count; nested
// blocks (callout/group/columns slots) are reached via recursion.
const PROSE_ATTRS: Readonly<
  Record<string, { readonly attr: string; readonly html: boolean }>
> = {
  "core/rich-text": { attr: "body", html: true },
  "core/details": { attr: "summary", html: false },
  "core/table-header-cell": { attr: "text", html: false },
  "core/table-cell": { attr: "text", html: false },
};

// CJK / Japanese / Korean ranges — scripts without inter-word spaces, so
// each character counts as one "word" (matching Word/Google Docs).
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/gu;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  "&nbsp;": " ",
  "&quot;": '"',
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

// Strip tags, decode the entities a contenteditable emits, and collapse
// whitespace. `&amp;` is decoded last so `&amp;lt;` stays a literal
// "&lt;" rather than double-decoding to "<". Good enough for a count —
// not a sanitizer.
//
// The tag matcher excludes `<` (not just `>`) from the inner class so a
// run of stray `<` can't make the engine rescan from each one — that is
// the polynomial-ReDoS shape (`<[^>]*>` on uncontrolled body input).
// `[^<>]` bounds it to a single linear pass.
function htmlToText(html: string): string {
  return html
    .replace(/<[^<>]*>/g, " ")
    .replace(/&(?:nbsp|quot|apos|lt|gt);/g, (m) => NAMED_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function countSegment(text: string): ProseCount {
  if (text.length === 0) return { words: 0, characters: 0 };
  const cjk = text.match(CJK)?.length ?? 0;
  const spaced = text.replace(CJK, " ").trim();
  const spacedWords = spaced ? spaced.split(/\s+/).length : 0;
  return {
    words: cjk + spacedWords,
    // Spread to count by code point so astral chars (emoji) count as one.
    characters: [...text].length,
  };
}

function collectText(blocks: readonly BlockNode[], out: string[]): void {
  for (const block of blocks) {
    const attrs = block.attrs ?? {};
    const prose = PROSE_ATTRS[block.name];
    if (prose) {
      const raw = attrs[prose.attr];
      if (typeof raw === "string") {
        out.push(prose.html ? htmlToText(raw) : raw.trim());
      }
    }
    // Recurse into nested block arrays (group / columns / callout / etc.).
    for (const value of Object.values(attrs)) {
      if (isBlockNodeArray(value)) collectText(value, out);
    }
  }
}

// Sum per segment rather than joining — a join separator would inflate
// the character total by one phantom char per block boundary.
export function countProse(blocks: readonly BlockNode[]): ProseCount {
  const segments: string[] = [];
  collectText(blocks, segments);
  let words = 0;
  let characters = 0;
  for (const segment of segments) {
    const count = countSegment(segment);
    words += count.words;
    characters += count.characters;
  }
  return { words, characters };
}
