import type { EntryData } from "plumix";
import type { AppContext } from "plumix/plugin";

import type { CardInputs } from "./card-identity.js";
import type { CardRegistry } from "./card-registry.js";
import type { OgCardSkip, OgChainOutcome } from "./chain-trace.js";
import type { CardRenderer } from "./renderer.js";
import { toBase64 } from "./base64.js";
import { buildCardArgs, renderCardBytes } from "./card-render.js";
import { chooseCard } from "./head.js";
import { isPreviewablePage } from "./shareable.js";
import { siteDefaultImage } from "./site.js";

/** `og-image` is an explicit `.ogImage()` role, which the filter never sees. */
export type CardPreviewOutcome = OgChainOutcome | "og-image";

export interface CardPreview {
  readonly outcome: CardPreviewOutcome;
  /**
   * Why there is no card, in the panel's own vocabulary, or null when there is.
   */
  readonly skipped: OgCardSkip | null;
  /**
   * What an `<img>` in the editor points at: a `data:` URI for a card, an
   * ordinary URL for every other link, and null where nothing resolved.
   */
  readonly src: string | null;
}

export interface PreviewCardInput {
  /** The entry being edited, resolved and authorised by the caller. */
  readonly data: EntryData;
  readonly ctx: AppContext;
  readonly cards: CardRegistry;
  readonly renderer: CardRenderer;
  readonly inputs: CardInputs;
  /** The extension a card reaches the page head under, if any. */
  readonly extension: string | undefined;
}

/**
 * Rendered live, draft included, never read from storage. Ignores third-party
 * `seo:og_image` subscribers, which may change what the page advertises.
 */
export async function previewCard(
  input: PreviewCardInput,
): Promise<CardPreview> {
  const { data, ctx, cards, renderer, inputs, extension } = input;
  const explicit = data.entry.images.ogImage;
  if (explicit) {
    return { outcome: "og-image", skipped: null, src: explicit.url };
  }
  const featured = data.entry.images.featured ?? null;

  const chosen = await chooseCard({
    data,
    ctx,
    cards,
    featured,
    extension,
    shareable: isPreviewablePage,
  });

  if (chosen.card !== null) {
    const args = await buildCardArgs(chosen.card, data, ctx, inputs.tokens);
    const bytes = await renderCardBytes({
      card: chosen.card,
      args,
      ctx,
      renderer,
      inputs,
    });
    return {
      outcome: "card",
      skipped: null,
      src: `data:${renderer.contentType};base64,${toBase64(bytes)}`,
    };
  }

  // The photo shaped to the card that was going to carry it, else the one the
  // chain itself falls to, else the site's own default.
  const shared = chosen.photo ?? featured;
  if (shared !== null) {
    return { outcome: "featured", skipped: chosen.skipped, src: shared.url };
  }
  const fallback = await siteDefaultImage(ctx);
  return { outcome: "site-default", skipped: chosen.skipped, src: fallback };
}
