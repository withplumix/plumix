import type { OgImage, TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";

import type { CardInputs } from "./card-identity.js";
import type { CardRegistry } from "./card-registry.js";
import type { CardDefinition } from "./card.js";
import { resolveCardIdentity } from "./card-identity.js";
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
  /** What a card renders with, which is half of what addresses it. */
  readonly inputs: CardInputs;
}

/**
 * What this plugin contributes to the page's `og:image`: the card, the entry's
 * own photo cropped to the card's shape, or null to leave the chain as it is.
 */
export async function pageOgImage(
  input: PageOgImageInput,
): Promise<OgImage | null> {
  const { image, featured, data, ctx, extension, cards, inputs } = input;
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
  // route's format, not the access question below, and not the card's digest,
  // each of which costs a resolver run of its own on every page that asks it.
  const cropped = featured === null ? null : cropToCard(ctx, featured, size);
  if (cropped !== null && card.mode !== "card") return cropped;

  // A URL only for an entry the route will serve, in a format a scraper
  // renders — otherwise the photo, even where a card declared itself the
  // share image, since there is no card for it to be.
  const generated =
    extension !== undefined && (await isShareableEntry(ctx, entry))
      ? await cardOgImage({
          card,
          data,
          entryId: entry.id,
          ctx,
          inputs,
          extension,
          size,
        })
      : null;
  return generated ?? cropped;
}

interface CardOgImageInput {
  readonly card: CardDefinition<TemplateData>;
  readonly data: TemplateData;
  /** Narrowed off `data` by the caller, which has already asked. */
  readonly entryId: number;
  readonly ctx: AppContext;
  readonly inputs: CardInputs;
  readonly extension: string;
  readonly size: CardSize;
}

// The digest is what makes this URL worth publishing: it moves when the card
// does, so an edit hands X, Facebook and LinkedIn a link they are not already
// holding. Taken from the same call the route makes, because a digest the
// route would not recognise redirects every scraper away from its own image.
async function cardOgImage(input: CardOgImageInput): Promise<OgImage> {
  const { card, data, entryId, ctx, inputs, extension, size } = input;
  const { digest } = await resolveCardIdentity(
    card,
    data,
    ctx,
    inputs,
    extension,
  );
  return { url: cardUrl(ctx, entryId, digest, extension), ...size };
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
