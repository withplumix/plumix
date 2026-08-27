import type { OgImage, TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import { resolveListingPage, ruleLabel } from "plumix";

import type { CardInputs } from "./card-identity.js";
import type { CardRegistry } from "./card-registry.js";
import type { CardTarget } from "./card-target.js";
import type { CardDefinition, CardSize } from "./card.js";
import type { OgCardSkip, OgChainTrace } from "./chain-trace.js";
import { resolveCardIdentity } from "./card-identity.js";
import { cardUrl } from "./card-route.js";
import { cardIdentityFor } from "./card-target.js";
import { cardSize } from "./card.js";
import { OG_PANEL_ID } from "./chain-trace.js";
import { isShareablePage } from "./shareable.js";

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
  const { image, featured, ctx, extension, cards, inputs } = input;
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
  const data = await cardPageData(ctx, input.data);
  const chosen = await chooseCard({ data, ctx, cards, featured, extension });
  if (chosen.card === null) return noCard({ ...chosen, featured });
  const url = await cardOgImageUrl({
    card: chosen.card,
    data,
    target: chosen.target,
    ctx,
    inputs,
    extension: chosen.extension,
  });
  return {
    image: { url, ...cardSize(chosen.card) },
    trace: {
      phase: "chain",
      outcome: "card",
      url,
      rule: chosen.rule,
      skipped: null,
    },
  };
}

/**
 * The page a card is rendered from, which is not always the page the head is
 * rendering. A card names an archive rather than one paginated slice of it, and
 * the route only ever resolves the archive's first page — so a head deeper in
 * the pagination has to ask the same question the route will, or it publishes a
 * digest taken over a different set of entries and every scraper following it
 * is redirected away from the image the page promised.
 *
 * Costs a listing query, and only on `/page/2` and beyond: on the first page
 * the head is already holding exactly what the route would resolve.
 */
async function cardPageData(
  ctx: AppContext,
  data: TemplateData,
): Promise<TemplateData> {
  const identity = cardIdentityFor(data);
  if (identity === null || identity.kind === "entry" || identity.page === 1) {
    return data;
  }
  const first = await resolveListingPage(ctx, identity.target);
  return first?.data ?? data;
}

export interface CardChoiceInput {
  readonly data: TemplateData;
  readonly ctx: AppContext;
  readonly cards: CardRegistry;
  /** The entry's `.featured()` photo, handed over by core. */
  readonly featured: OgImage | null;
  /**
   * The format a card would be served in, or undefined for a renderer whose
   * output scrapers do not render.
   */
  readonly extension: string | undefined;
  /**
   * Whether this page may carry a card at all. Defaults to the question the
   * route answers; the editor preview passes the same question minus its
   * status half, so a draft previews while an entry no scraper could reach
   * still gets no card.
   */
  readonly shareable?: (
    ctx: AppContext,
    data: TemplateData,
  ) => Promise<boolean>;
}

/** A card to render, or the reason there is none and the photo standing in. */
export type CardChoice =
  | {
      readonly card: CardDefinition<TemplateData>;
      readonly target: CardTarget;
      readonly extension: string;
      readonly rule: string;
      readonly photo: null;
      readonly skipped: null;
    }
  | {
      readonly card: null;
      /** The entry's photo shaped to the card that was going to carry it. */
      readonly photo: OgImage | null;
      readonly rule: string | null;
      readonly skipped: OgCardSkip;
    };

/**
 * Whether this page gets a generated card, and what stands in when it does
 * not. One branch order, so the head and the editor preview cannot disagree
 * about which link of the chain wins — the whole point of a preview being that
 * it says what the page will say.
 */
export async function chooseCard(input: CardChoiceInput): Promise<CardChoice> {
  const { data, ctx, cards, featured, extension } = input;
  const shareable = input.shareable ?? isShareablePage;
  // A rule declared against a search page or a plugin archive resolves, but
  // neither can be named by an identity a URL carries, so neither has a card
  // URL to advertise.
  const identity = cardIdentityFor(data);
  if (identity === null) {
    return { card: null, photo: null, rule: null, skipped: "page-kind" };
  }
  const rule = cards.resolve(identity.node, data);
  if (rule === undefined) {
    return { card: null, photo: null, rule: null, skipped: "no-rule" };
  }
  const { card } = rule;
  const matched = ruleLabel(rule);
  // The photo standing in for the card needs nothing else resolved — not the
  // route's format, not the access question below, and not the card's digest,
  // each of which costs a resolver run of its own on every page that asks it.
  const photo =
    featured === null ? null : cropToCard(ctx, featured, cardSize(card));
  if (photo !== null && card.mode !== "card") {
    return { card: null, photo, rule: matched, skipped: "featured-preferred" };
  }
  // A card only for a page the route will serve, in a format a scraper
  // renders. Failing either, the shaped photo goes out instead — even where a
  // card declared itself the share image, since there is no card for it to be.
  if (extension === undefined) {
    return { card: null, photo, rule: matched, skipped: "renderer-format" };
  }
  if (!(await shareable(ctx, data))) {
    return { card: null, photo, rule: matched, skipped: "not-shareable" };
  }
  return {
    card,
    target: identity.target,
    extension,
    rule: matched,
    photo: null,
    skipped: null,
  };
}

interface CardOgImageInput {
  readonly card: CardDefinition<TemplateData>;
  readonly data: TemplateData;
  /** Named off `data` by the caller, which has already asked. */
  readonly target: CardTarget;
  readonly ctx: AppContext;
  readonly inputs: CardInputs;
  readonly extension: string;
}

// The digest is what makes this URL worth publishing: it moves when the card
// does, so an edit hands X, Facebook and LinkedIn a link they are not already
// holding. Taken from the same call the route makes, because a digest the
// route would not recognise redirects every scraper away from its own image.
async function cardOgImageUrl(input: CardOgImageInput): Promise<string> {
  const { card, data, target, ctx, inputs, extension } = input;
  const { digest } = await resolveCardIdentity(
    card,
    data,
    ctx,
    inputs,
    extension,
  );
  return cardUrl(ctx, target, digest, extension);
}

interface NoCardInput {
  /**
   * The entry's photo shaped to the card that was going to carry it — set
   * where a rule matched and something after it refused the card, absent where
   * there was no card to take a shape from.
   */
  readonly photo: OgImage | null;
  /** The uncropped photo, which core falls to when this returns nothing. */
  readonly featured: OgImage | null;
  readonly rule: string | null;
  readonly skipped: OgCardSkip;
}

/**
 * No card on the chain. The page lands on the entry's photo either way — this
 * one returning it shaped, or core's own next link taking it as it stands — so
 * the trace names that photo whichever of the two supplies it.
 */
function noCard(input: NoCardInput): ChainResolution {
  const { photo, featured, rule, skipped } = input;
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
