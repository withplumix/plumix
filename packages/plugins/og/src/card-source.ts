import type { TemplateData } from "plumix";

import type { CardDefinition } from "./card.js";
import { shortDigest } from "./digest.js";

const HASHES = new WeakMap<CardDefinition<TemplateData>, Promise<string>>();

/**
 * Covers only the card's own function bodies: a card whose design lives in a
 * child component needs that child's identity in its `key`.
 */
export function cardSourceHash(
  definition: CardDefinition<TemplateData>,
): Promise<string> {
  let hash = HASHES.get(definition);
  if (hash === undefined) {
    hash = shortDigest(cardSource(definition));
    HASHES.set(definition, hash);
  }
  return hash;
}

/**
 * `key` is left out: changing what it reads already moves the key, so hashing
 * it would only re-render on cosmetic edits.
 */
function cardSource(definition: CardDefinition<TemplateData>): string {
  return JSON.stringify([
    definition.render.toString(),
    definition.styles ?? [],
    definition.width ?? null,
    definition.height ?? null,
  ]);
}
