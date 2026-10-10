import type { BlockSpec, BlockTextInput } from "./block-registry.js";
import type { BlockSpecLookup } from "./block-slots.js";
import type { BlockNode } from "./render-block-tree.js";
import { createBlockRegistry } from "./block-registry.js";
import { blockSlotKeys } from "./block-slots.js";
import { isBlockNodeArray } from "./render-block-tree.js";

/**
 * What the walk reads, merged from a registry (or any spec list). Built once
 * and reused, so a walk over many entries doesn't re-merge it per entry.
 */
export interface BlockTextRoster {
  /** Each block's declared text inputs, by block name. */
  readonly text: ReadonlyMap<string, readonly BlockTextInput[]>;
  /** The merged specs, which decide the slots the walk descends into. */
  readonly specs: BlockSpecLookup;
}

/** One extracted run of text, tagged with whether it is body copy. */
export interface BlockTextSegment {
  readonly text: string;
  readonly prose: boolean;
}

/**
 * Bump when the extraction algorithm changes; the roster hash can't detect
 * that.
 */
const EXTRACTOR_ALGORITHM = "1";

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  "&nbsp;": " ",
  "&quot;": '"',
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

const MAX_CODE_POINT = 0x10ffff;

/**
 * A code point past the Unicode ceiling throws out of `String.fromCodePoint`,
 * so an out-of-range entity is left as the literal it already is.
 */
function fromCodePoint(match: string, code: number): string {
  return code <= MAX_CODE_POINT ? String.fromCodePoint(code) : match;
}

const RAW_ELEMENT = /<(script|style)\b[^<>]*>/gi;

/**
 * Drops bodies, not just tags, because `core/html` stores markup raw. A scan,
 * not a lazy regex, which would rescan to the end from every unclosed opener.
 */
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

/**
 * `&amp;` decodes last so `&amp;lt;` stays "&lt;". Not a sanitizer. `[^<>]`
 * rather than `[^>]` keeps stray `<` runs from triggering polynomial ReDoS.
 */
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

const isProse = (input: BlockTextInput): boolean => input.prose !== false;

/**
 * Last write wins, as in `createBlockRegistry`, including an override that
 * declares no text, which drops the name.
 */
export function blockTextRoster(specs: Iterable<BlockSpec>): BlockTextRoster {
  const merged = [...specs];
  const text = new Map<string, readonly BlockTextInput[]>();
  for (const spec of merged) {
    if (spec.text && spec.text.length > 0) text.set(spec.name, spec.text);
    else text.delete(spec.name);
  }
  return { text, specs: createBlockRegistry(merged) };
}

export function collectBlockText(
  blocks: readonly BlockNode[],
  roster: BlockTextRoster,
): readonly BlockTextSegment[] {
  const segments: BlockTextSegment[] = [];
  const walk = (nodes: readonly BlockNode[]): void => {
    for (const block of nodes) {
      const attrs = block.attrs ?? {};
      for (const input of roster.text.get(block.name) ?? []) {
        const raw = attrs[input.name];
        if (typeof raw !== "string") continue;
        const text = input.html ? htmlToText(raw) : raw.trim();
        if (text.length > 0) segments.push({ text, prose: isProse(input) });
      }
      // Recurse into slots (group / columns / table rows / details content).
      for (const key of blockSlotKeys(block, roster.specs.get(block.name))) {
        const value = attrs[key];
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
 * Normalized before hashing so the tag tracks the declared set, not
 * registration or input order. 64-bit FNV-1a: a collision means affected rows
 * never reindex.
 */
export function blockTextVersion(roster: BlockTextRoster): string {
  const declarations = [...roster.text]
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
