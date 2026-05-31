import type {
  BlockRegistry,
  BlockSpec,
  InsertableBlockEntry,
} from "@plumix/blocks";
import type { PatternManifestEntry } from "@plumix/core/manifest";
import { expandBlockVariations } from "@plumix/blocks";

import { PUCK_ROOT_ZONE } from "./puck-zones.js";

export { PUCK_ROOT_ZONE };

export type SlashMenuItem =
  | { readonly kind: "block"; readonly entry: InsertableBlockEntry }
  | { readonly kind: "pattern"; readonly entry: PatternManifestEntry };

interface ResolveSlashMenuItemsOptions {
  readonly capabilities: ReadonlySet<string>;
  readonly query: string;
  readonly patterns?: readonly PatternManifestEntry[];
}

const TITLE_MATCH = 3;
const KEYWORD_MATCH = 2;
const NAME_MATCH = 1;

export function resolveSlashMenuItems(
  registry: BlockRegistry,
  { capabilities, query, patterns }: ResolveSlashMenuItemsOptions,
): readonly SlashMenuItem[] {
  const needle = query.trim().toLowerCase();
  const scored: { item: SlashMenuItem; score: number }[] = [];

  const eligibleSpecs: BlockSpec[] = [];
  for (const spec of registry) {
    if (spec.inserter === false) continue;
    if (!isInsertableForCapabilities(spec, capabilities)) continue;
    eligibleSpecs.push(spec);
  }

  function pushScored(item: SlashMenuItem): void {
    if (needle === "") {
      scored.push({ item, score: 0 });
      return;
    }
    const score = matchScore(item, needle);
    if (score > 0) scored.push({ item, score });
  }

  for (const entry of expandBlockVariations(eligibleSpecs)) {
    pushScored({ kind: "block", entry });
  }
  for (const entry of patterns ?? []) {
    pushScored({ kind: "pattern", entry });
  }

  if (needle !== "") {
    scored.sort((a, b) => b.score - a.score);
  }
  return scored.map(({ item }) => item);
}

function isInsertableForCapabilities(
  spec: BlockSpec,
  capabilities: ReadonlySet<string>,
): boolean {
  if (!spec.capability) return true;
  return capabilities.has(spec.capability);
}

// Category-as-keyword matches patterns only — block entries don't
// surface category as an alias today. Prefix semantics mirror the
// keyword scorer so typing "her" matches a pattern with category
// "hero", not just the exact slug.
function matchScore(item: SlashMenuItem, needle: string): number {
  const { entry } = item;
  if (entry.title.toLowerCase().includes(needle)) return TITLE_MATCH;
  if (entry.keywords?.some((k) => k.toLowerCase().startsWith(needle))) {
    return KEYWORD_MATCH;
  }
  if (
    item.kind === "pattern" &&
    entry.category?.toLowerCase().startsWith(needle)
  ) {
    return KEYWORD_MATCH;
  }
  if (entry.name.toLowerCase().includes(needle)) return NAME_MATCH;
  return 0;
}

interface InsertPointSelector {
  readonly zone?: string;
  readonly index: number;
}

export function nextInsertPoint(
  selector: InsertPointSelector | null | undefined,
  rootContentLength: number,
): { zone: string; index: number } {
  if (!selector) return { zone: PUCK_ROOT_ZONE, index: rootContentLength };
  return {
    zone: selector.zone ?? PUCK_ROOT_ZONE,
    index: selector.index + 1,
  };
}
