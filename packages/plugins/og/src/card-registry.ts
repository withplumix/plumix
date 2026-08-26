import type { ResolvedNode, TemplateData } from "plumix";
import { resolveRule } from "plumix";

import type { CardRule } from "./card.js";

export interface CardRegistry {
  /** Called once, from `theme:ready`, with whatever the theme declared. */
  load(themeCards: readonly CardRule[]): void;
  resolve(node: ResolvedNode, data: TemplateData): CardRule | undefined;
}

/**
 * The node a card rule matches against, for an entry that has one. The route
 * builds it from the database row and the head from the entry the page is
 * rendering, and both have to name the same node or they resolve to different
 * rules — and then disagree about the card's size.
 */
export function entryCardNode(entry: {
  readonly id: number;
  readonly type: string;
  readonly slug: string;
}): ResolvedNode {
  return {
    kind: "content",
    entryType: entry.type,
    slug: entry.slug,
    databaseId: entry.id,
  };
}

/**
 * The plugin's own copy of what the theme declared, snapshotted at boot.
 * `defaults` sit behind the theme's rules in declaration order, which is all
 * that makes a declared card outrank the plugin's own — including at the
 * `fallback` tier, where the resolver takes the first one it finds.
 */
export function createCardRegistry(
  defaults: readonly CardRule[],
): CardRegistry {
  let rules: readonly CardRule[] = defaults;
  return {
    load: (themeCards) => {
      rules = [...themeCards, ...defaults];
    },
    resolve: (node, data) => resolveRule(rules, node, data),
  };
}
