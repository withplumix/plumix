import type { TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import { loadTemplateDeps } from "plumix";

import type { CardKey } from "./card-key.js";
import type { CardArgs, CardDefinition } from "./card.js";
import type { ThemeTokenSet } from "./tokens.js";
import { cardSourceHash } from "./card-source.js";
import { shortDigest } from "./digest.js";
import { CARD_HEIGHT, CARD_WIDTH } from "./renderer.js";

/**
 * What a card resolves to before anything renders: the arguments it is
 * rendered from, the digest that addresses it, and the size the digest
 * describes.
 */
export interface CardIdentity {
  readonly args: CardArgs<TemplateData>;
  readonly key: CardKey;
  /** The URL segment naming this render, and the storage key's own. */
  readonly digest: string;
  readonly width: number;
  readonly height: number;
}

/**
 * What a card is rendered with beyond the card itself. Both are folded into
 * the digest, because both change what comes out: a swapped font face, a
 * retuned palette.
 */
export interface CardInputs {
  /** Asset-layer font paths, in fallback order. */
  readonly fonts: readonly string[];
  readonly tokens: ThemeTokenSet;
}

/**
 * Resolve one card's identity. The head calls it to name the URL a page
 * advertises and the route calls it to decide which URL it is answering on, so
 * the two agree on one digest by computing it the same way rather than by
 * staying in step.
 *
 * What they do *not* share is how `data` got here: the head passes the page's
 * own, which core has already run through `resolve:single:data` and the
 * preview-autosave overlay, while the route rebuilds one from the row. A card
 * keyed on anything a subscriber to that filter rewrites therefore digests
 * differently on the two sides, and every scraper is redirected away from its
 * image — the cost of the two askers not sharing a render.
 */
export async function resolveCardIdentity(
  card: CardDefinition<TemplateData>,
  data: TemplateData,
  ctx: AppContext,
  inputs: CardInputs,
  extension: string,
): Promise<CardIdentity> {
  const cardCtx = pinLocale(ctx);
  const args: CardArgs<TemplateData> = {
    // Spread first, so a dep kind named `data`, `ctx` or `tokens` cannot
    // displace the framework-owned set — the same ordering the template
    // renderer uses.
    ...(await loadTemplateDeps(
      { ...card },
      cardCtx.plugins.templateDeps,
      cardCtx,
    )),
    data,
    ctx: cardCtx,
    tokens: inputs.tokens.values,
  };
  // Read once: the size the digest describes has to be the size that is
  // rendered, or the stored bytes are not what the URL says they are.
  const width = card.width ?? CARD_WIDTH;
  const height = card.height ?? CARD_HEIGHT;
  const key = card.key(args);

  return {
    args,
    key,
    width,
    height,
    digest: await cardDigest({
      id: key.id,
      sourceHash: await cardSourceHash(card),
      tokens: inputs.tokens.stylesheets,
      fonts: inputs.fonts,
      width,
      height,
      extension,
    }),
  };
}

/**
 * The context a card sees, which is the request's with its locale pinned to
 * the site default.
 *
 * A card has to resolve identically wherever it is asked from, and the two
 * askers do not agree on a locale: `resolveLocale` reads `Accept-Language` and
 * the `Path=/_plumix/` cookie on the card's own route and on neither the page
 * the head renders on. Left alone, a scraper sending `Accept-Language` digests
 * a URL the head never published and takes a redirect instead of its image —
 * and a card that reads the locale without naming it in its key would freeze
 * whichever locale asked first into the bytes behind a content-addressed URL,
 * where no purge can reach them. Cards are content, and core's i18n is UI-only,
 * so the default locale is the honest one to render every card in.
 */
function pinLocale(ctx: AppContext): AppContext {
  return ctx.locale.code === ctx.i18n.defaultLocale.code
    ? ctx
    : { ...ctx, locale: ctx.i18n.defaultLocale };
}

interface CardDigestParts {
  /** The card's own identity, from its `key` callback. */
  readonly id: string;
  /** The card's source, so a redesign lands on a fresh digest. */
  readonly sourceHash: string;
  /** The theme's token sheet, so a retuned palette lands on a fresh digest. */
  readonly tokens: readonly string[];
  /** Asset-layer paths, not bytes — a swapped font file lands on a new path. */
  readonly fonts: readonly string[];
  readonly width: number;
  readonly height: number;
  /** Stands in for the output format, which it names one-to-one. */
  readonly extension: string;
}

/**
 * One card's identity, digested over what the card read, what the card is, and
 * the size and format it is rendered at — so an edit lands on a fresh digest,
 * and both the URL that carries it and the ETag the read-through derives from
 * the storage key move with it. The renderer's own identity is not in here:
 * two implementations declaring the same content type share digests, so
 * swapping between them serves what the previous one stored.
 */
function cardDigest(parts: CardDigestParts): Promise<string> {
  return shortDigest(JSON.stringify(parts));
}
