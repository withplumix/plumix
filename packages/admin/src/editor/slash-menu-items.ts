import type {
  BlockRegistry,
  BlockSpec,
  InsertableBlockEntry,
} from "@plumix/blocks";
import { expandBlockVariations } from "@plumix/blocks";

import { PUCK_ROOT_ZONE } from "./puck-zones.js";

export { PUCK_ROOT_ZONE };

export type SlashMenuItem = InsertableBlockEntry;

export interface ResolveSlashMenuItemsOptions {
  readonly capabilities: ReadonlySet<string>;
  readonly query: string;
}

const TITLE_MATCH = 3;
const KEYWORD_MATCH = 2;
const NAME_MATCH = 1;

export function resolveSlashMenuItems(
  registry: BlockRegistry,
  { capabilities, query }: ResolveSlashMenuItemsOptions,
): readonly SlashMenuItem[] {
  const needle = query.trim().toLowerCase();
  const scored: { item: SlashMenuItem; score: number }[] = [];

  const eligibleSpecs: BlockSpec[] = [];
  for (const spec of registry) {
    if (spec.inserter === false) continue;
    if (!isInsertableForCapabilities(spec, capabilities)) continue;
    eligibleSpecs.push(spec);
  }

  for (const item of expandBlockVariations(eligibleSpecs)) {
    if (needle === "") {
      scored.push({ item, score: 0 });
      continue;
    }
    const score = matchScore(item, needle);
    if (score > 0) scored.push({ item, score });
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

function matchScore(item: SlashMenuItem, needle: string): number {
  if (item.title.toLowerCase().includes(needle)) return TITLE_MATCH;
  if (item.keywords?.some((k) => k.toLowerCase().startsWith(needle))) {
    return KEYWORD_MATCH;
  }
  if (item.name.toLowerCase().includes(needle)) return NAME_MATCH;
  return 0;
}

export interface InsertPointSelector {
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
