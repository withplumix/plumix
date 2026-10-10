import type { TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";

import type { CardFontPlan } from "./card-fonts.js";
import type { CardKey } from "./card-key.js";
import type { CardArgs, CardDefinition } from "./card.js";
import type { ThemeTokenSet } from "./tokens.js";
import { buildCardArgs } from "./card-render.js";
import { cardSourceHash } from "./card-source.js";
import { cardSize } from "./card.js";
import { shortDigest } from "./digest.js";

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

/** Both change the rendered bytes, so both are digested. */
export interface CardInputs {
  /** The configured font set split by what this renderer reads. */
  readonly fonts: CardFontPlan;
  readonly tokens: ThemeTokenSet;
}

/**
 * The head passes filtered page data while the route rebuilds it from the row,
 * so a card keyed on anything `resolve:single:data` rewrites digests
 * differently on each side.
 */
export async function resolveCardIdentity(
  card: CardDefinition<TemplateData>,
  data: TemplateData,
  ctx: AppContext,
  inputs: CardInputs,
  extension: string,
): Promise<CardIdentity> {
  const args = await buildCardArgs(card, data, pinLocale(ctx), inputs.tokens);
  // The same call the render makes, so the digested size is the rendered size.
  const { width, height } = cardSize(card);
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
      // An unreadable face reaches no render, so it must not move the URL.
      fonts: inputs.fonts.readable,
      width,
      height,
      extension,
    }),
  };
}

// The card route resolves locale from `Accept-Language` and a `/_plumix/`
// cookie the page never sees, so head and route would digest differently.
// Core's i18n is UI-only anyway.
function pinLocale(ctx: AppContext): AppContext {
  return ctx.locale.code === ctx.config.i18n.defaultLocale.code
    ? ctx
    : { ...ctx, locale: ctx.config.i18n.defaultLocale };
}

interface CardDigestParts {
  readonly id: string;
  readonly sourceHash: string;
  readonly tokens: readonly string[];
  /** Paths, not bytes: a swapped font file lands on a new path. */
  readonly fonts: readonly string[];
  readonly width: number;
  readonly height: number;
  /** Stands in for the output format, which it names one-to-one. */
  readonly extension: string;
}

// The renderer isn't digested: two renderers with the same content type share
// digests, so swapping serves what the previous one stored.
function cardDigest(parts: CardDigestParts): Promise<string> {
  return shortDigest(JSON.stringify(parts));
}
