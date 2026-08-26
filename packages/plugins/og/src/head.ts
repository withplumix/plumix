import type { TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";

import type { CardRegistry } from "./card-registry.js";
import { entryCardNode } from "./card-registry.js";
import { cardUrl } from "./card-route.js";
import { CARD_HEIGHT, CARD_WIDTH } from "./renderer.js";
import { isShareableEntry } from "./shareable.js";

interface CardImage {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

/**
 * The card this page should advertise as its `og:image`, or null to leave the
 * head to whatever the site configured.
 *
 * The size comes off the rule the route would resolve, not off the defaults: a
 * theme card may declare its own, and a scraper that lays out 1200x630 for a
 * 1600x900 card gets a cropped or letterboxed preview.
 */
export function cardImage(
  data: TemplateData,
  ctx: AppContext,
  extension: string,
  cards: CardRegistry,
): CardImage | null {
  // Only entries have a card URL. A rule declared against any other page kind
  // resolves, but nothing addresses those pages yet.
  if (data.kind !== "entry") return null;
  const { entry } = data;
  if (!isShareableEntry(ctx, entry)) return null;
  const rule = cards.resolve(entryCardNode(entry), data);
  if (rule === undefined) return null;
  return {
    url: cardUrl(ctx, entry.id, extension),
    width: rule.card.width ?? CARD_WIDTH,
    height: rule.card.height ?? CARD_HEIGHT,
  };
}
