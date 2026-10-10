import type { TemplateData } from "plumix";
import type { ResolvedNode } from "plumix/plugin";
import { resolveRule } from "plumix/plugin";

import type { CardRule } from "./card.js";

export interface CardRegistry {
  /** Called once, from `theme:ready`, with whatever the theme declared. */
  load(themeCards: readonly CardRule[]): void;
  resolve(node: ResolvedNode, data: TemplateData): CardRule | undefined;
  /** Every rule, in declaration order — the theme's, then the plugin's own. */
  list(): readonly CardRule[];
}

/**
 * `defaults` sit behind the theme's rules, which is what makes a declared card
 * outrank them, including at the `fallback` tier.
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
    list: () => rules,
  };
}
