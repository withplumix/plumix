import type { TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import { loadTemplateDeps } from "plumix";

import type { CardInputs } from "./card-identity.js";
import type { CardArgs, CardDefinition } from "./card.js";
import type { CardRenderer } from "./renderer.js";
import type { ThemeTokenSet } from "./tokens.js";
import { resolveCardImages } from "./card-images.js";
import { cardSize } from "./card.js";
import { OgPluginError } from "./errors.js";

// A card is bytes a renderer produced, and the renderer is a slot: `remote()`
// and any third-party implementation can answer with whatever they like, served
// inline from the site's own origin. SVG is a document to a browser, so a
// direct navigation would run whatever script those bytes carried. The media
// plugin answers the same hazard by forcing a download; a card has to stay
// viewable, so it is defused wherever one is served.
export const SANDBOX_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * The arguments a card is both keyed and rendered from. Deps are spread first,
 * so a dep kind named `data`, `ctx` or `tokens` cannot displace the
 * framework-owned set — the same ordering the template renderer uses.
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
  /** The same fonts and tokens the card's digest was taken over. */
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

/**
 * Fonts come from the platform asset layer rather than the Worker bundle, so
 * adding cards costs no deployment size. The engine reads TTF, OTF and WOFF —
 * not WOFF2, which is what most font packages ship.
 *
 * A declared font that cannot be read fails the render rather than dropping to
 * the engine's own fallback face, which would answer 200 with a card nobody
 * meant to publish. The failure then takes the route's fallback path.
 */
async function loadFonts(
  ctx: AppContext,
  paths: readonly string[],
): Promise<Uint8Array[]> {
  if (paths.length === 0) return [];
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
