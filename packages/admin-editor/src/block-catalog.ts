import type { BlockNode, BlockRegistry, BlockSpec } from "@plumix/blocks";
import { rewriteBlockNodeIds } from "@plumix/blocks";
import { labelSourceText } from "@plumix/core/i18n";

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
