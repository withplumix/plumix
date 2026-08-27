import type { OgImage, TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import { ruleLabel } from "plumix";

import type { CardInputs } from "./card-identity.js";
import type { CardRegistry } from "./card-registry.js";
import type { CardDefinition, CardSize } from "./card.js";
import type { OgCardSkip, OgChainTrace } from "./chain-trace.js";
import { resolveCardIdentity } from "./card-identity.js";
import { entryCardNode } from "./card-registry.js";
import { cardUrl } from "./card-route.js";
import { cardSize } from "./card.js";
import { OG_PANEL_ID } from "./chain-trace.js";
import { isShareableEntry } from "./shareable.js";

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
 *
 * The decision is traced as it is made. Four links resolve one `og:image` and
 * nothing in the rendered page says which of them won, so the debug-bar panel
 * reads this back — including the reason a card was skipped, which is the whole
 * answer to "why is my card not showing".
 */
export async function pageOgImage(
  input: PageOgImageInput,
): Promise<OgImage | null> {
  const { image, trace } = await resolveChain(input);
  input.ctx.telemetry.record(OG_PANEL_ID, trace);
  return image;
}

interface ChainResolution {
  /** What the filter returns — null leaves the chain to core's own tail. */
  readonly image: OgImage | null;
  readonly trace: OgChainTrace;
}

async function resolveChain(input: PageOgImageInput): Promise<ChainResolution> {
  const { image, featured, data, ctx, extension, cards, inputs } = input;
  // An image already on the chain is another contributor's deliberate choice,
  // which a generated card does not outrank however the `plugins: []` array
  // happened to be ordered.
  if (image !== null) {
    return {
      image,
      trace: {
        phase: "chain",
        outcome: "supplied",
        url: image.url,
        rule: null,
        skipped: null,
      },
    };
  }
  // Only entries have a card URL. A rule declared against any other page kind
  // resolves, but nothing addresses those pages yet.
  if (data.kind !== "entry") return noCard({ featured, skipped: "page-kind" });
  const { entry } = data;
  const rule = cards.resolve(entryCardNode(entry), data);
  if (rule === undefined) return noCard({ featured, skipped: "no-rule" });
  const { card } = rule;
  const matched = ruleLabel(rule);
  // A theme card may declare its own size, and a scraper laying out 1200x630
  // for a 1600x900 card gets a letterboxed preview — so the size comes off the
  // rule the route would resolve, not off the defaults.
  const size = cardSize(card);
  // The photo standing in for the card needs nothing else resolved — not the
  // route's format, not the access question below, and not the card's digest,
  // each of which costs a resolver run of its own on every page that asks it.
  const photo = featured === null ? null : cropToCard(ctx, featured, size);
  if (photo !== null && card.mode !== "card") {
    return noCard({
      photo,
      featured,
      rule: matched,
      skipped: "featured-preferred",
    });
  }
  // A card only for an entry the route will serve, in a format a scraper
  // renders. Failing either, the shaped photo goes out instead — even where a
  // card declared itself the share image, since there is no card for it to be.
  if (extension === undefined) {
    return noCard({
      photo,
      featured,
      rule: matched,
      skipped: "renderer-format",
    });
  }
  if (!(await isShareableEntry(ctx, entry))) {
    return noCard({ photo, featured, rule: matched, skipped: "not-shareable" });
  }
  const url = await cardOgImageUrl({
    card,
    data,
    entryId: entry.id,
    ctx,
    inputs,
    extension,
  });
  return {
    image: { url, ...size },
    trace: {
      phase: "chain",
      outcome: "card",
      url,
      rule: matched,
      skipped: null,
    },
  };
}

interface CardOgImageInput {
  readonly card: CardDefinition<TemplateData>;
  readonly data: TemplateData;
  /** Narrowed off `data` by the caller, which has already asked. */
  readonly entryId: number;
  readonly ctx: AppContext;
  readonly inputs: CardInputs;
  readonly extension: string;
}

// The digest is what makes this URL worth publishing: it moves when the card
// does, so an edit hands X, Facebook and LinkedIn a link they are not already
// holding. Taken from the same call the route makes, because a digest the
// route would not recognise redirects every scraper away from its own image.
async function cardOgImageUrl(input: CardOgImageInput): Promise<string> {
  const { card, data, entryId, ctx, inputs, extension } = input;
  const { digest } = await resolveCardIdentity(
    card,
    data,
    ctx,
    inputs,
    extension,
  );
  return cardUrl(ctx, entryId, digest, extension);
}

interface NoCardInput {
  /**
   * The entry's photo shaped to the card that was going to carry it — set
   * where a rule matched and something after it refused the card, absent where
   * there was no card to take a shape from.
   */
  readonly photo?: OgImage | null;
  /** The uncropped photo, which core falls to when this returns nothing. */
  readonly featured: OgImage | null;
  readonly rule?: string | null;
  readonly skipped: OgCardSkip;
}

/**
 * No card on the chain. The page lands on the entry's photo either way — this
 * one returning it shaped, or core's own next link taking it as it stands — so
 * the trace names that photo whichever of the two supplies it.
 */
function noCard(input: NoCardInput): ChainResolution {
  const { photo = null, featured, rule = null, skipped } = input;
  const shared = photo ?? featured;
  return {
    image: photo,
    trace: {
      phase: "chain",
      outcome: shared === null ? "site-default" : "featured",
      url: shared?.url ?? null,
      rule,
      skipped,
    },
  };
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
