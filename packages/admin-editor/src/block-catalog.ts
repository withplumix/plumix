import type {
  BlockNode,
  BlockPattern,
  BlockRegistry,
  InsertableBlockEntry,
  JsonValue,
} from "@plumix/core/blocks";
import {
  blockSlotKeys,
  expandBlockVariations,
  isBlockNodeArray,
  rewriteBlockNodeIds,
} from "@plumix/core/blocks";
import { labelSourceText } from "@plumix/core/i18n";

const CONTENT_SLOT = "content";

/** A plain-string `category` so the manifest's wire form flows in too. */
export type InserterPattern = Omit<BlockPattern, "category"> & {
  readonly category?: string;
};

/** Undefined when the slot is unrestricted or the parent/slot is unknown. */
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
  // Case-insensitive over name, title and keywords.
  readonly query?: string;
  readonly allowed?: readonly string[];
  // Undefined is the top level, which hides parent-bound blocks.
  readonly parentName?: string;
  // Undefined hides entry-type-scoped blocks.
  readonly entryType?: string;
}

interface InsertableGroup {
  readonly category: string;
  readonly entries: readonly InsertableBlockEntry[];
}

/** A block with inserter variations surfaces those instead of its bare self. */
export function groupInsertables(
  registry: BlockRegistry,
  { capabilities, query, allowed, parentName, entryType }: GroupOptions,
): readonly InsertableGroup[] {
  const needle = query?.trim().toLowerCase() ?? "";
  const eligible = [...registry].filter(
    (spec) =>
      spec.inserter !== false &&
      (!spec.capability || capabilities.has(spec.capability)) &&
      (!allowed || allowed.includes(spec.name)) &&
      (!spec.requiresParent ||
        (parentName !== undefined &&
          spec.requiresParent.includes(parentName))) &&
      (!spec.entryTypes ||
        (entryType !== undefined && spec.entryTypes.includes(entryType))),
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

/**
 * Variation slugs are only unique per parent block, so they're qualified by its
 * name.
 */
export function entryKey(entry: InsertableBlockEntry): string {
  return entry.slug === entry.name ? entry.slug : `${entry.name}/${entry.slug}`;
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
  const attrs: Record<string, JsonValue> = {
    ...spec?.defaults,
    ...entry.attrs,
  };
  if (entry.innerBlocks) attrs[CONTENT_SLOT] = entry.innerBlocks;
  // Ids are minted fresh below, so the spec's template ids never leak into the
  // tree.
  for (const input of spec?.inputs ?? []) {
    if (
      input.type === "slot" &&
      input.defaultChildren &&
      attrs[input.name] === undefined
    ) {
      attrs[input.name] = input.defaultChildren;
    }
  }
  // Descendants get their own spec defaults like a directly-inserted child.
  const seed: BlockNode = {
    id: "seed",
    name: entry.name,
    attrs,
    ...(spec?.defaultStyles ? { style: spec.defaultStyles } : {}),
  };
  for (const key of blockSlotKeys(seed, spec)) {
    const value = attrs[key];
    if (isBlockNodeArray(value)) {
      attrs[key] = value.map((child) => seedNodeDefaults(child, registry));
    }
  }
  const [node = seed] = rewriteBlockNodeIds([seed], registry);
  return node;
}

// Doesn't seed a nested container's `defaultChildren`: a container placed in
// `defaultChildren` must spell out its own children.
function seedNodeDefaults(node: BlockNode, registry: BlockRegistry): BlockNode {
  const spec = registry.get(node.name);
  const attrs: Record<string, JsonValue> = { ...spec?.defaults, ...node.attrs };
  for (const key of blockSlotKeys(node, spec)) {
    const value = attrs[key];
    if (isBlockNodeArray(value)) {
      attrs[key] = value.map((child) => seedNodeDefaults(child, registry));
    }
  }
  const style = node.style ?? spec?.defaultStyles;
  return {
    ...node,
    attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
    ...(style ? { style } : {}),
  };
}

/** Ids are re-minted so inserting the same pattern twice cannot collide. */
export function expandPattern(
  pattern: InserterPattern,
  registry: BlockRegistry,
): readonly BlockNode[] {
  return rewriteBlockNodeIds(pattern.content, registry);
}

function matchesEntry(entry: InsertableBlockEntry, needle: string): boolean {
  if (entry.name.toLowerCase().includes(needle)) return true;
  if (labelSourceText(entry.title).toLowerCase().includes(needle)) return true;
  return (entry.keywords ?? []).some((keyword) =>
    labelSourceText(keyword).toLowerCase().includes(needle),
  );
}
