import type { TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import { loadTemplateDeps } from "plumix/plugin";

import type { CardFontPlan } from "./card-fonts.js";
import type { CardInputs } from "./card-identity.js";
import type { CardArgs, CardDefinition } from "./card.js";
import type { CardRenderer } from "./renderer.js";
import type { ThemeTokenSet } from "./tokens.js";
import { resolveCardImages } from "./card-images.js";
import { cardSize } from "./card.js";
import { OgPluginError } from "./errors.js";

// A renderer may return any bytes, served from the site's origin; SVG could run
// script on direct navigation, and a card must stay viewable rather than
// downloaded.
export const SANDBOX_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * Deps spread first, so a dep named `data`, `ctx` or `tokens` can't displace
 * them.
 */
export async function buildCardArgs(
  card: CardDefinition<TemplateData>,
  data: TemplateData,
  ctx: AppContext,
  tokens: ThemeTokenSet,
): Promise<CardArgs<TemplateData>> {
  return {
    ...(await loadTemplateDeps({ ...card }, ctx.plugins.templateDeps, ctx)),
    data,
    ctx,
    tokens: tokens.values,
  };
}

export interface RenderCardOptions {
  readonly card: CardDefinition<TemplateData>;
  readonly args: CardArgs<TemplateData>;
  readonly ctx: AppContext;
  readonly renderer: CardRenderer;
  /** The same tokens and font plan the card's digest was taken over — that
   *  digest naming the plan's readable half, which is what this renderer gets. */
  readonly inputs: CardInputs;
}

/** One card's bytes: images resolved, fonts read, then the renderer. */
export async function renderCardBytes(
  options: RenderCardOptions,
): Promise<Uint8Array> {
  const { card, args, ctx, renderer, inputs } = options;
  const [{ node, images }, faces] = await Promise.all([
    resolveCardImages(card.render(args), ctx),
    loadFonts(ctx, inputs.fonts),
  ]);
  return renderer.render(node, {
    // The same call the digest was taken over, so the stored bytes are the
    // size the URL says they are.
    ...cardSize(card),
    // The theme's sheet first: a card is written against those properties, and
    // one that redefines a token is meant to win.
    stylesheets: [...inputs.tokens.stylesheets, ...(card.styles ?? [])],
    images,
    fonts: faces,
    fetch: ctx.fetch,
  });
}

// An unreadable font fails the render rather than falling back to the engine's
// face, which would publish a card nobody meant to.
async function loadFonts(
  ctx: AppContext,
  plan: CardFontPlan,
): Promise<Uint8Array[]> {
  const paths = plan.readable;
  if (paths.length === 0) {
    if (plan.unreadable.length === 0) return [];
    throw OgPluginError.fontFormatUnsupported({
      paths: plan.unreadable,
      formats: plan.formats,
    });
  }
  const assets = ctx.assets;
  if (assets === undefined) throw OgPluginError.assetLayerMissing({ paths });

  return Promise.all(
    paths.map(async (path) => {
      const response = await assets.fetch(
        new Request(new URL(path, ctx.origin)),
      );
      if (!response.ok) {
        throw OgPluginError.fontAssetMissing({
          path,
          status: response.status,
        });
      }
      return new Uint8Array(await response.arrayBuffer());
    }),
  );
}
