import type { EntryData } from "plumix";
import type { AppContext } from "plumix/plugin";
import { entryRoleImage } from "plumix";

import type { CardInputs } from "./card-identity.js";
import type { CardRegistry } from "./card-registry.js";
import type { OgCardSkip, OgChainOutcome } from "./chain-trace.js";
import type { CardRenderer } from "./renderer.js";
import { toBase64 } from "./base64.js";
import { buildCardArgs, renderCardBytes } from "./card-render.js";
import { chooseCard } from "./head.js";
import { isPreviewablePage } from "./shareable.js";
import { siteDefaultImage } from "./site.js";

/**
 * Which link of the `og:image` chain answered for this entry — the debug bar's
 * own vocabulary, plus the one link the `seo:og_image` filter never sees
 * because an explicit `.ogImage()` role short-circuits above it.
 */
export type CardPreviewOutcome = OgChainOutcome | "og-image";

export interface CardPreview {
  readonly outcome: CardPreviewOutcome;
  /** Why there is no card, in the panel's own vocabulary, or null when there is. */
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
 * The image this entry will be shared with, and which link of the chain
 * produced it — resolved live for the entry as it stands, draft included.
 *
 * Nothing is read from storage or from the edge: a card is addressed by a
 * digest over what it read, so a draft has no stable URL and an entry under
 * edit moves out from under one. The card is rendered on the spot instead, and
 * its digest is never computed — there is no URL here to name.
 *
 * Only this plugin's own contribution is modelled. A third-party subscriber to
 * `seo:og_image` sitting between the role markers and the card would change
 * what the page ends up advertising without changing what this says.
 */
export async function previewCard(
  input: PreviewCardInput,
): Promise<CardPreview> {
  const { data, ctx, cards, renderer, inputs, extension } = input;
  const explicit = entryRoleImage(ctx.plugins, data, "ogImage");
  if (explicit !== null) {
    return { outcome: "og-image", skipped: null, src: explicit.url };
  }
  const featured = entryRoleImage(ctx.plugins, data, "featured");

  const chosen = await chooseCard({
    data,
    ctx,
    cards,
    featured,
    extension,
    // The status half of `isShareablePage` is deliberately dropped — showing
    // a draft's card is the point — and the rest of it deliberately is not: an
    // entry whose page a scraper can never reach gets no card in the head, so
    // naming one here would preview an image the page will not use.
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

  // The photo shaped to the card that was going to carry it, else the one core
  // itself falls to, else the site's own default.
  const shared = chosen.photo ?? featured;
  if (shared !== null) {
    return { outcome: "featured", skipped: chosen.skipped, src: shared.url };
  }
  const fallback = await siteDefaultImage(ctx);
  return { outcome: "site-default", skipped: chosen.skipped, src: fallback };
}
