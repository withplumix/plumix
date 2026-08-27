import type { OgImage, TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";

import type { CardRegistry } from "./card-registry.js";
import { entryCardNode } from "./card-registry.js";
import { cardUrl } from "./card-route.js";
import { CARD_HEIGHT, CARD_WIDTH } from "./renderer.js";
import { isShareableEntry } from "./shareable.js";

interface CardSize {
  readonly width: number;
  readonly height: number;
}

interface PageOgImageInput {
  /** Whatever an earlier `seo:og_image` subscriber supplied, if any. */
  readonly image: OgImage | null;
  /** The entry's `.featured()` photo, handed over by core. */
  readonly featured: OgImage | null;
  readonly data: TemplateData;
  readonly ctx: AppContext;
  /**
   * The extension a card is advertised under, or undefined when the connected
   * renderer makes a format scrapers do not render. A card still has a route
   * then; it just never reaches the head.
   */
  readonly extension: string | undefined;
  readonly cards: CardRegistry;
}

/**
 * What this plugin contributes to the page's `og:image`: the card, the entry's
 * own photo cropped to the card's shape, or null to leave the chain as it is.
 */
export async function pageOgImage(
  input: PageOgImageInput,
): Promise<OgImage | null> {
  const { image, featured, data, ctx, extension, cards } = input;
  // An image already on the chain is another contributor's deliberate choice,
  // which a generated card does not outrank however the `plugins: []` array
  // happened to be ordered.
  if (image !== null) return image;
  // Only entries have a card URL. A rule declared against any other page kind
  // resolves, but nothing addresses those pages yet.
  if (data.kind !== "entry") return null;
  const { entry } = data;
  const rule = cards.resolve(entryCardNode(entry), data);
  if (rule === undefined) return null;
  const { card } = rule;
  // A theme card may declare its own size, and a scraper laying out 1200x630
  // for a 1600x900 card gets a letterboxed preview — so the size comes off the
  // rule the route would resolve, not off the defaults.
  const size: CardSize = {
    width: card.width ?? CARD_WIDTH,
    height: card.height ?? CARD_HEIGHT,
  };
  // The photo standing in for the card needs nothing else resolved — not the
  // route's format, and not the access question below, which costs a policy
  // resolver run of its own on every page that asks it.
  const cropped = featured === null ? null : cropToCard(ctx, featured, size);
  if (cropped !== null && card.mode !== "card") return cropped;

  // A URL only for an entry the route will serve, in a format a scraper
  // renders — otherwise the photo, even where a card declared itself the
  // share image, since there is no card for it to be.
  const generated =
    extension !== undefined && (await isShareableEntry(ctx, entry))
      ? { url: cardUrl(ctx, entry.id, extension), ...size }
      : null;
  return generated ?? cropped;
}

// Cropping the photo to the card's shape is what stops a scraper cropping it
// badly, and it is pure URL math — no rasterizer, no wasm, no CPU.
function cropToCard(ctx: AppContext, image: OgImage, size: CardSize): OgImage {
  const url = ctx.imageDelivery?.url(image.url, { ...size, fit: "cover" });
  // Handing the source back unchanged is the only way the slot's `url` can say
  // it declined, and no delivery at all says the same thing. The photo still
  // goes out — an uncropped picture unfurls where no picture does not — but at
  // its own size rather than described as a crop that never happened.
  return url === undefined || url === image.url ? image : { url, ...size };
}
