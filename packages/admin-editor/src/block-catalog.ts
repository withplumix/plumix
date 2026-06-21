import type {
  BlockNode,
  BlockPattern,
  BlockRegistry,
  BlockSpec,
  InsertableBlockEntry,
} from "@plumix/blocks";
import { expandBlockVariations, rewriteBlockNodeIds } from "@plumix/blocks";
import { labelSourceText } from "@plumix/core/i18n";

const PATTERN_REF_BLOCK = "core/pattern-ref";
/** The conventional slot a block variation seeds its `innerBlocks` into. */
const CONTENT_SLOT = "content";

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

interface CatalogGroup {
  readonly category: string;
  readonly blocks: readonly BlockSpec[];
}

const UNCATEGORIZED = "uncategorized";

interface GroupOptions {
  readonly capabilities: ReadonlySet<string>;
  /** Case-insensitive filter over name, title and keywords. */
  readonly query?: string;
}

/**
 * Build the inserter catalog: eligible blocks (shown in the inserter and
 * within the viewer's capabilities), optionally filtered by query, grouped by
 * category. Category and within-category order follow registry iteration
 * order; empty groups are dropped.
 */
export function groupBlocksByCategory(
  registry: BlockRegistry,
  { capabilities, query }: GroupOptions,
): readonly CatalogGroup[] {
  const needle = query?.trim().toLowerCase() ?? "";
  const order: string[] = [];
  const buckets = new Map<string, BlockSpec[]>();
  for (const spec of registry) {
    if (spec.inserter === false) continue;
    if (spec.capability && !capabilities.has(spec.capability)) continue;
    if (needle && !matchesQuery(spec, needle)) continue;
    const category = spec.category ?? UNCATEGORIZED;
    let bucket = buckets.get(category);
    if (!bucket) {
      bucket = [];
      buckets.set(category, bucket);
      order.push(category);
    }
    bucket.push(spec);
  }
  return order.map((category) => ({
    category,
    blocks: buckets.get(category) ?? [],
  }));
}

export interface InsertableGroup {
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
  const order: string[] = [];
  const buckets = new Map<string, InsertableBlockEntry[]>();
  for (const entry of expandBlockVariations(eligible)) {
    if (needle && !matchesEntry(entry, needle)) continue;
    const category = entry.category ?? UNCATEGORIZED;
    let bucket = buckets.get(category);
    if (!bucket) {
      bucket = [];
      buckets.set(category, bucket);
      order.push(category);
    }
    bucket.push(entry);
  }
  return order.map((category) => ({
    category,
    entries: buckets.get(category) ?? [],
  }));
}

/** Patterns matching the query (name / title / keywords); all when blank. */
export function filterPatterns(
  patterns: readonly BlockPattern[],
  query?: string,
): readonly BlockPattern[] {
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
export function expandPattern(pattern: BlockPattern): readonly BlockNode[] {
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

/** A fresh, insertable block node from a catalog spec: its defaults plus a
 *  freshly minted id (reusing the same crypto id path as pattern insertion). */
export function createBlockFromSpec(spec: BlockSpec): BlockNode {
  const seed: BlockNode = {
    id: "seed",
    name: spec.name,
    attrs: { ...spec.defaults },
  };
  const [node = seed] = rewriteBlockNodeIds([seed]);
  return node;
}

function matchesQuery(spec: BlockSpec, needle: string): boolean {
  if (spec.name.toLowerCase().includes(needle)) return true;
  if (
    spec.title !== undefined &&
    labelSourceText(spec.title).toLowerCase().includes(needle)
  ) {
    return true;
  }
  return (spec.keywords ?? []).some((keyword) =>
    labelSourceText(keyword).toLowerCase().includes(needle),
  );
}
