import type {
  BlockNode,
  BlockPattern,
  BlockRegistry,
  InsertableBlockEntry,
} from "@plumix/blocks";
import {
  expandBlockVariations,
  isBlockNodeArray,
  rewriteBlockNodeIds,
} from "@plumix/blocks";
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
  /** Restrict to these block names (a slot's `allowedBlocks`); `undefined`
   *  permits every eligible block. */
  readonly allowed?: readonly string[];
  /** The block the inserter targets, for enforcing each candidate's
   *  `requiresParent`. `undefined` = the top level (parent-bound blocks hidden). */
  readonly parentName?: string;
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
  { capabilities, query, allowed, parentName }: GroupOptions,
): readonly InsertableGroup[] {
  const needle = query?.trim().toLowerCase() ?? "";
  const eligible = [...registry].filter(
    (spec) =>
      spec.inserter !== false &&
      (!spec.capability || capabilities.has(spec.capability)) &&
      (!allowed || allowed.includes(spec.name)) &&
      (!spec.requiresParent ||
        (parentName !== undefined && spec.requiresParent.includes(parentName))),
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
  const spec = registry.get(entry.name);
  const attrs: Record<string, unknown> = {
    ...spec?.defaults,
    ...entry.attrs,
  };
  if (entry.innerBlocks) attrs[CONTENT_SLOT] = entry.innerBlocks;
  // Seed each declared slot's defaultChildren unless that slot was already
  // provided (by defaults, the variation's attrs, or innerBlocks). Ids are
  // minted fresh below, so the spec's template ids never leak into the tree.
  for (const input of spec?.inputs ?? []) {
    if (
      input.type === "slot" &&
      input.defaultChildren &&
      attrs[input.name] === undefined
    ) {
      attrs[input.name] = input.defaultChildren;
    }
  }
  // Seed each seeded slot child with its own spec defaults + defaultStyles, so a
  // container's descendants (e.g. the equal-split columns and their paragraphs)
  // are treated like a directly-inserted child. The top node's own defaults are
  // already merged above; only descendants recurse.
  for (const key of Object.keys(attrs)) {
    const value = attrs[key];
    if (isBlockNodeArray(value)) {
      attrs[key] = value.map((child) => seedNodeDefaults(child, registry));
    }
  }
  const seed: BlockNode = {
    id: "seed",
    name: entry.name,
    attrs,
    ...(spec?.defaultStyles ? { style: spec.defaultStyles } : {}),
  };
  const [node = seed] = rewriteBlockNodeIds([seed]);
  return node;
}

// Apply a node's own spec `defaults` (attrs) + `defaultStyles` (style) where it
// carries none, recursing through its slots (an existing attr/style wins). This
// seeds a descendant's own defaults, but NOT a nested container's empty slot
// `defaultChildren` — a container placed in `defaultChildren` must spell out its
// own children, as core/columns' DEFAULT_COLUMNS does.
function seedNodeDefaults(node: BlockNode, registry: BlockRegistry): BlockNode {
  const spec = registry.get(node.name);
  const base: Record<string, unknown> = { ...spec?.defaults, ...node.attrs };
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    attrs[key] = isBlockNodeArray(value)
      ? value.map((child) => seedNodeDefaults(child, registry))
      : value;
  }
  const style = node.style ?? spec?.defaultStyles;
  return {
    ...node,
    attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
    ...(style ? { style } : {}),
  };
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
