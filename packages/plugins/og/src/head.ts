// The `OgImage` import pulls in plugin-seo's augmentation, without which
// `index.ts`'s `seo:og_image` subscription doesn't typecheck.
import type { TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import { ruleLabel } from "plumix/plugin";

import type { OgImage } from "@plumix/plugin-seo";

import type { CardInputs } from "./card-identity.js";
import type { CardRegistry } from "./card-registry.js";
import type { CardTarget } from "./card-target.js";
import type { CardDefinition, CardSize } from "./card.js";
import type { OgCardSkip, OgChainTrace } from "./chain-trace.js";
import { resolveCardIdentity } from "./card-identity.js";
import { cardTargetData, cardUrl } from "./card-route.js";
import { cardIdentityFor } from "./card-target.js";
import { cardSize } from "./card.js";
import { OG_PANEL_ID } from "./chain-trace.js";
import { isShareablePage } from "./shareable.js";

interface PageOgImageInput {
  readonly image: OgImage | null;
  readonly featured: OgImage | null;
  readonly data: TemplateData;
  readonly ctx: AppContext;
  /** Undefined when scrapers don't render the renderer's format. */
  readonly extension: string | undefined;
  readonly cards: CardRegistry;
  readonly inputs: CardInputs;
}

/**
 * The card, the featured photo cropped to its shape, or null. Traced, since
 * nothing in the page says which link won.
 */
export async function pageOgImage(
  input: PageOgImageInput,
): Promise<OgImage | null> {
  const { image, trace } = await resolveChain(input);
  input.ctx.telemetry.record(OG_PANEL_ID, trace);
  return image;
}

interface ChainResolution {
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
 * The route always resolves an archive's first page and the live row, never an
 * autosave, so the head must digest the same data on later pages and previews.
 */
async function cardPageData(
  ctx: AppContext,
  data: TemplateData,
): Promise<TemplateData> {
  const identity = cardIdentityFor(data);
  if (identity === null) return data;
  const differs =
    identity.kind === "entry" ? isPreviewRender(ctx) : identity.page !== 1;
  if (!differs) return data;
  return (await cardTargetData(ctx, identity.target)) ?? data;
}

function isPreviewRender(ctx: AppContext): boolean {
  const entity = ctx.resolvedEntity;
  return entity?.kind === "entry" && entity.preview;
}

export interface CardChoiceInput {
  readonly data: TemplateData;
  readonly ctx: AppContext;
  readonly cards: CardRegistry;
  /** The entry's `.featured()` photo, handed over by the chain. */
  readonly featured: OgImage | null;
  /**
   * The format a card would be served in, or undefined for a renderer whose
   * output scrapers do not render.
   */
  readonly extension: string | undefined;
  /**
   * Defaults to the route's check; the editor preview drops its status half.
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

/** Shared by the head and the editor preview so they agree on the winner. */
export async function chooseCard(input: CardChoiceInput): Promise<CardChoice> {
  const { data, ctx, cards, featured, extension } = input;
  const shareable = input.shareable ?? isShareablePage;
  // Search pages and plugin archives match rules but have no card URL.
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
  const photo =
    featured === null ? null : cropToCard(ctx, featured, cardSize(card));
  if (photo !== null && card.mode !== "card") {
    return { card: null, photo, rule: matched, skipped: "featured-preferred" };
  }
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
  readonly target: CardTarget;
  readonly ctx: AppContext;
  readonly inputs: CardInputs;
  readonly extension: string;
}

/**
 * The same call the route makes; a digest the route doesn't recognise would
 * redirect every scraper away.
 */
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
  /** Cropped to the card that was refused; null when no rule matched. */
  readonly photo: OgImage | null;
  readonly featured: OgImage | null;
  readonly rule: string | null;
  readonly skipped: OgCardSkip;
}

/**
 * The trace names the photo whether this returns it cropped or the chain's next
 * link takes it as is.
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

/**
 * Cropping the photo to the card's shape is what stops a scraper cropping it
 * badly, and it is pure URL math — no rasterizer, no wasm, no CPU.
 */
function cropToCard(ctx: AppContext, image: OgImage, size: CardSize): OgImage {
  const url = ctx.imageDelivery?.url(image.url, { ...size, fit: "cover" });
  // An unchanged `url` means the slot declined to crop, so keep the photo's own
  // size.
  return url === undefined || url === image.url
    ? image
    : { url, ...size, alt: image.alt };
}
