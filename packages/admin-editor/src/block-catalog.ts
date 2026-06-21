import type {
  BlockNode,
  BlockPattern,
  BlockRegistry,
  InsertableBlockEntry,
} from "@plumix/blocks";
import { expandBlockVariations, rewriteBlockNodeIds } from "@plumix/blocks";
import { labelSourceText } from "@plumix/core/i18n";

const PATTERN_REF_BLOCK = "core/pattern-ref";
/** The conventional slot a block variation seeds its `innerBlocks` into. */
const CONTENT_SLOT = "content";

/**
 * A pattern as the inserter consumes it. Identical to `BlockPattern` but with a
 * plain-string `category`, so both authored patterns and the manifest's wire
 * form (`PatternManifestEntry`, whose category is an open string) flow in. The
 * inserter never groups by pattern category, so the narrow key buys nothing
 * here.
 */
export type InserterPattern = Omit<BlockPattern, "category"> & {
  readonly category?: string;
};

/**
 * A slot's `allowedBlocks` list (the block names it accepts), or undefined when
 * the slot is unrestricted or the parent/slot is unknown. Resolved from the
 * parent block's slot input in the registry — the policy the canvas drop and
 * the inserter enforce.
 */
export function slotAllowedBlocks(
  registry: BlockRegistry,
  parentName: string,
  slotKey: string,
): readonly string[] | undefined {
  const input = registry
    .get(parentName)
    ?.inputs?.find((i) => i.type === "slot" && i.name === slotKey);
  return input?.allowedBlocks;
}

const UNCATEGORIZED = "uncategorized";

interface GroupOptions {
  readonly capabilities: ReadonlySet<string>;
  /** Case-insensitive filter over name, title and keywords. */
  readonly query?: string;
}

interface InsertableGroup {
  readonly category: string;
  readonly entries: readonly InsertableBlockEntry[];
}

/**
 * The inserter's block list: every eligible block plus its inserter-scoped
 * variations (a block with inserter variations surfaces those instead of its
 * bare self), capability-gated, query-filtered, grouped by category in
 * registry order with empty groups dropped.
 */
export function groupInsertables(
  registry: BlockRegistry,
  { capabilities, query }: GroupOptions,
): readonly InsertableGroup[] {
  const needle = query?.trim().toLowerCase() ?? "";
  const eligible = [...registry].filter(
    (spec) =>
      spec.inserter !== false &&
      (!spec.capability || capabilities.has(spec.capability)),
  );
  // Map iteration is insertion-ordered, which is the registry order we want.
  const buckets = new Map<string, InsertableBlockEntry[]>();
  for (const entry of expandBlockVariations(eligible)) {
    if (needle && !matchesEntry(entry, needle)) continue;
    const category = entry.category ?? UNCATEGORIZED;
    let bucket = buckets.get(category);
    if (!bucket) buckets.set(category, (bucket = []));
    bucket.push(entry);
  }
  return [...buckets].map(([category, entries]) => ({ category, entries }));
}

/** Patterns matching the query (name / title / keywords); all when blank. */
export function filterPatterns(
  patterns: readonly InserterPattern[],
  query?: string,
): readonly InserterPattern[] {
  const needle = query?.trim().toLowerCase() ?? "";
  if (!needle) return patterns;
  return patterns.filter(
    (pattern) =>
      pattern.name.toLowerCase().includes(needle) ||
      labelSourceText(pattern.title).toLowerCase().includes(needle) ||
      (pattern.keywords ?? []).some((keyword) =>
        labelSourceText(keyword).toLowerCase().includes(needle),
      ),
  );
}

/** A fresh node for an inserter entry (block or variation): the spec's defaults
 *  under the variation's attrs preset, innerBlocks seeded into the content slot,
 *  every id freshly minted. */
export function createNodeFromEntry(
  registry: BlockRegistry,
  entry: InsertableBlockEntry,
): BlockNode {
  const attrs: Record<string, unknown> = {
    ...registry.get(entry.name)?.defaults,
    ...entry.attrs,
  };
  if (entry.innerBlocks) attrs[CONTENT_SLOT] = entry.innerBlocks;
  const seed: BlockNode = { id: "seed", name: entry.name, attrs };
  const [node = seed] = rewriteBlockNodeIds([seed]);
  return node;
}

/** The concrete block(s) a pattern inserts: a deep-cloned, id-rewritten copy of
 *  its composition, or a single `core/pattern-ref` node for reference patterns
 *  (the walker resolves the reference at render). */
export function expandPattern(pattern: InserterPattern): readonly BlockNode[] {
  if (pattern.insert === "reference") {
    return rewriteBlockNodeIds([
      { id: "seed", name: PATTERN_REF_BLOCK, attrs: { slug: pattern.name } },
    ]);
  }
  return rewriteBlockNodeIds(pattern.content);
}

function matchesEntry(entry: InsertableBlockEntry, needle: string): boolean {
  if (entry.name.toLowerCase().includes(needle)) return true;
  if (labelSourceText(entry.title).toLowerCase().includes(needle)) return true;
  return (entry.keywords ?? []).some((keyword) =>
    labelSourceText(keyword).toLowerCase().includes(needle),
  );
}
