import type { BlockSpec, BlockTextInput } from "./block-registry.js";
import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";

/**
 * The merged `block name → declared text inputs` roster the walk reads. Built
 * once from a registry (or any spec list) and reused, so a walk over many
 * entries doesn't re-merge it per entry.
 */
export type BlockTextRoster = ReadonlyMap<string, readonly BlockTextInput[]>;

/** One extracted run of text, tagged with whether it is body copy. */
export interface BlockTextSegment {
  readonly text: string;
  readonly prose: boolean;
}

// Bumped when the extraction algorithm changes — a new named entity, a
// different tag strip. The block roster hashes itself, but nothing else would
// tell an index derived by an older extractor from a current one.
const EXTRACTOR_ALGORITHM = "1";

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  "&nbsp;": " ",
  "&quot;": '"',
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

const MAX_CODE_POINT = 0x10ffff;

// A code point past the Unicode ceiling throws out of `String.fromCodePoint`,
// so an out-of-range entity is left as the literal it already is.
function fromCodePoint(match: string, code: number): string {
  return code <= MAX_CODE_POINT ? String.fromCodePoint(code) : match;
}

const RAW_ELEMENT = /<(script|style)\b[^<>]*>/gi;

// Drop `<script>` and `<style>` bodies, not just their tags: a bare tag strip
// leaves JS source and CSS declarations behind as page text, and `core/html`
// stores its markup raw (sanitization happens at render). An unclosed element
// swallows the rest of the string, as a browser's parser does.
//
// Written as a scan rather than one `<script>[\s\S]*?</script>` regex: that
// shape rescans to the end of the input from every unclosed opener, which is
// the same polynomial blowup the tag matcher below is written to avoid.
function stripRawElements(html: string): string {
  const lower = html.toLowerCase();
  let out = "";
  let cursor = 0;
  RAW_ELEMENT.lastIndex = 0;
  for (
    let open = RAW_ELEMENT.exec(html);
    open !== null;
    open = RAW_ELEMENT.exec(html)
  ) {
    out += html.slice(cursor, open.index);
    const close = lower.indexOf(
      `</${open[1]?.toLowerCase() ?? ""}`,
      RAW_ELEMENT.lastIndex,
    );
    const end = close === -1 ? -1 : lower.indexOf(">", close);
    cursor = end === -1 ? html.length : end + 1;
    RAW_ELEMENT.lastIndex = cursor;
  }
  return out + html.slice(cursor);
}

// Strip tags, decode the entities a contenteditable emits, and collapse
// whitespace. `&amp;` is decoded last so `&amp;lt;` stays a literal
// "&lt;" rather than double-decoding to "<". Good enough for a count or an
// index — not a sanitizer.
//
// The tag matcher excludes `<` (not just `>`) from the inner class so a
// run of stray `<` can't make the engine rescan from each one — that is
// the polynomial-ReDoS shape (`<[^>]*>` on uncontrolled body input).
// `[^<>]` bounds it to a single linear pass.
function htmlToText(html: string): string {
  return stripRawElements(html)
    .replace(/<[^<>]*>/g, " ")
    .replace(/&(?:nbsp|quot|apos|lt|gt);/g, (m) => NAMED_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (m, code: string) => fromCodePoint(m, Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex: string) =>
      fromCodePoint(m, Number.parseInt(hex, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** `prose` defaults to true: an input is body copy unless it opts out. */
const isProse = (input: BlockTextInput): boolean => input.prose !== false;

/**
 * Merge every spec's text declaration into one roster. Last write wins, the
 * same way `createBlockRegistry` resolves a re-registered name — including when
 * the overriding spec declares no text, which drops the name entirely.
 */
export function blockTextRoster(specs: Iterable<BlockSpec>): BlockTextRoster {
  const roster = new Map<string, readonly BlockTextInput[]>();
  for (const spec of specs) {
    if (spec.text && spec.text.length > 0) roster.set(spec.name, spec.text);
    else roster.delete(spec.name);
  }
  return roster;
}

/**
 * Walk `blocks` — nested slots included — emitting one segment per declared
 * input that holds a string. Shared by the search extractor and the
 * reading-length counter, which differ only in the segments they keep.
 */
export function collectBlockText(
  blocks: readonly BlockNode[],
  roster: BlockTextRoster,
): readonly BlockTextSegment[] {
  const segments: BlockTextSegment[] = [];
  const walk = (nodes: readonly BlockNode[]): void => {
    for (const block of nodes) {
      const attrs = block.attrs ?? {};
      for (const input of roster.get(block.name) ?? []) {
        const raw = attrs[input.name];
        if (typeof raw !== "string") continue;
        const text = input.html ? htmlToText(raw) : raw.trim();
        if (text.length > 0) segments.push({ text, prose: isProse(input) });
      }
      // Recurse into slots (group / columns / table rows / details content).
      for (const value of Object.values(attrs)) {
        if (isBlockNodeArray(value)) walk(value);
      }
    }
  };
  walk(blocks);
  return segments;
}

/**
 * The plain text an entry's block tree carries: every declared input, tags
 * stripped and entities decoded, walked depth-first. Newline-joined so adjacent
 * blocks don't fuse into one word.
 */
export function extractBlockText(
  blocks: readonly BlockNode[],
  roster: BlockTextRoster,
): string {
  return collectBlockText(blocks, roster)
    .map((segment) => segment.text)
    .join("\n");
}

/**
 * A tag for the extraction a roster produces, so whatever was derived from an
 * older one can be told apart from the current. Sorted and default-normalized
 * before hashing, so the tag tracks the declared *set* — not the order specs
 * registered in, the order a block listed its inputs, or the fields an author
 * chose to spell out. Reordering inputs moves the extracted string but not the
 * tokens in it.
 *
 * Two-lane FNV-1a to 64 bits: cheap, synchronous and dependency-free. Only
 * change detection is needed, not cryptographic strength — but a collision
 * means affected rows never reindex, so 32 bits is thinner than it needs to be.
 */
export function blockTextVersion(roster: BlockTextRoster): string {
  const declarations = [...roster]
    .map(([name, inputs]): readonly [string, readonly string[]] => [
      name,
      [...inputs]
        .map(
          (input) =>
            `${input.name}:${input.html ? "h" : "t"}${isProse(input) ? "p" : "a"}`,
        )
        .sort(),
    ])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonical = JSON.stringify([EXTRACTOR_ALGORITHM, declarations]);
  let low = 0x811c9dc5;
  let high = 0x01000193;
  for (let i = 0; i < canonical.length; i += 1) {
    const code = canonical.charCodeAt(i);
    low = Math.imul(low ^ code, 0x01000193);
    high = Math.imul(high ^ code, 0x85ebca6b);
  }
  return (
    (low >>> 0).toString(16).padStart(8, "0") +
    (high >>> 0).toString(16).padStart(8, "0")
  );
}
