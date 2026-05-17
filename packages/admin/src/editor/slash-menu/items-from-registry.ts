import type { BlockRegistry } from "@plumix/blocks";

export interface SlashMenuItem {
  readonly name: string;
  readonly title: string;
  readonly description?: string;
  readonly category: string;
  readonly keywords?: readonly string[];
}

/**
 * Project the block registry into the SlashMenuItem shape.
 *
 * Skips child-only specs (those carrying a `parent` declaration) since
 * the user inserts them through the parent's own template, not as a
 * standalone slash-menu choice.
 */
export function itemsFromRegistry(
  registry: BlockRegistry,
): readonly SlashMenuItem[] {
  const items: SlashMenuItem[] = [];
  for (const [, spec] of registry) {
    const parent = (spec as unknown as { parent?: unknown }).parent;
    if (typeof parent === "string") continue;
    items.push({
      name: spec.name,
      title: spec.title,
      description: spec.description,
      category: spec.category ?? "typography",
      keywords: spec.keywords,
    });
  }
  return items;
}
