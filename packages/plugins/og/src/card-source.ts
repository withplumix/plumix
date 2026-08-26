import type { TemplateData } from "plumix";

import type { CardDefinition } from "./card.js";
import { shortDigest } from "./digest.js";

const HASHES = new WeakMap<CardDefinition<TemplateData>, Promise<string>>();

/**
 * The card-source hash folded into every key that card produces, so a redesign
 * invalidates what it replaced without a manual version bump.
 *
 * Read off the card's own functions rather than generated at build time, so it
 * needs no codegen pass and no deploy identifier — neither of which the
 * platform offers. It covers the card's own body: a component the card calls
 * out to is a separate function, so a card whose design lives in a child needs
 * the child's identity in its `key`.
 *
 * Taken on first use rather than at boot, because a Worker's top level is a
 * poor place to be doing asynchronous work.
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

// The key callback is deliberately absent: an edit that changes what it reads
// already moves the key it returns, so folding its source in would only
// re-render every card behind it when someone reformats a comment.
function cardSource(definition: CardDefinition<TemplateData>): string {
  return JSON.stringify([
    definition.render.toString(),
    definition.styles ?? [],
    definition.width ?? null,
    definition.height ?? null,
  ]);
}
