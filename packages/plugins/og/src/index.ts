import type { PluginDescriptor } from "plumix/plugin";
import { definePlugin } from "plumix/plugin";

import type { CardInputs } from "./card-identity.js";
import type { CardRenderer } from "./renderer.js";
import { createCardRegistry } from "./card-registry.js";
import { CARD_ROUTE_PATH, createCardRoute } from "./card-route.js";
import { defaultCards } from "./default-card.js";
import { bundledRenderer } from "./default-renderer.js";
import { pageOgImage } from "./head.js";
import { advertisedExtension } from "./renderer.js";
import { compileThemeTokens } from "./tokens.js";

export type {
  CardArgs,
  CardDefinition,
  CardMode,
  CardRule,
  CardSelector,
} from "./card.js";
export { card } from "./card.js";
export type { CardKey } from "./card-key.js";
export { cardKey } from "./card-key.js";
export type {
  CardContainerNode,
  CardImage,
  CardImageNode,
  CardNode,
  CardRenderer,
  CardRenderInput,
  CardTextNode,
} from "./renderer.js";
export type { RemoteRendererOptions } from "./remote.js";
export { remote } from "./remote.js";

export interface OgPluginOptions {
  /**
   * How a card's node tree becomes bytes. Defaults to the engine bundled with
   * this package, rasterizing to PNG; `takumi({ format: "jpeg" })` and
   * `svgOnly()` on the `/takumi` subpath and {@link remote} are the shipped
   * alternatives. Only PNG and JPEG reach a page's head — what X, Facebook and
   * LinkedIn all render. Any other format still gets its route, so a card is
   * viewable while you build it, but the head keeps the site-wide default.
   *
   * Selecting one does not shrink the deploy: the default is resolved inside
   * this package, so the engine is part of the install either way, and the
   * SVG-only implementation is that same engine's SVG output. Only
   * {@link remote} leaves the engine unexecuted.
   */
  readonly renderer?: CardRenderer;
  /**
   * Font files to render with, as paths into the platform asset layer
   * (Cloudflare's `ASSETS`), in fallback order. They are read at render time,
   * so they cost nothing in the Worker bundle. TTF, OTF and WOFF are read;
   * WOFF2 — what most font packages ship — is not, and the failure is a card
   * with no text on it. Left empty, the engine's own fallback face is used.
   */
  readonly fonts?: readonly string[];
}

/**
 * Generated social cards. Installing it and configuring nothing serves a card
 * per published entry at `/_plumix/og/entry/<id>/<digest>.<ext>`, composited
 * from the bundled default template — the entry's title over the site's name.
 *
 * @example
 * ```ts
 * import { og } from "@plumix/plugin-og";
 *
 * plumix({
 *   storage: r2({ binding: "MEDIA" }),
 *   plugins: [og({ fonts: ["/fonts/Inter-SemiBold.ttf"] })],
 * });
 * ```
 */
export function og(options: OgPluginOptions = {}): PluginDescriptor {
  const renderer = options.renderer ?? bundledRenderer();
  const cards = createCardRegistry(defaultCards);
  const fonts = options.fonts ?? [];
  let tokens = compileThemeTokens();
  // One accessor for both readers: the head and the route have to land on the
  // same digest, and they only do that if they read the same inputs.
  const inputs = (): CardInputs => ({ fonts, tokens });
  const handler = createCardRoute({ renderer, cards, inputs });
  // Advertising is decided by what the renderer declares it produces, not by a
  // flag of its own.
  const advertised = advertisedExtension(renderer.contentType);

  return definePlugin("og", {
    // Async because of the dev import below; core awaits `setup` before it
    // reads any registry, so registration order is unaffected.
    setup: async (ctx) => {
      // The theme is validated after plugins install, so its cards arrive on
      // the boot-time handover rather than here. One snapshot serves every
      // request — nothing about a rule set is request-scoped.
      ctx.addAction("theme:ready", (theme) => {
        cards.load(theme.ogCards ?? []);
        tokens = compileThemeTokens(theme.tokens);
      });
      ctx.registerRoute({
        method: "GET",
        path: CARD_ROUTE_PATH,
        auth: "public",
        // A card is one document for every visitor, and content-addressing is
        // what guarantees it rather than an absence of reads: a card that reads
        // something visitor-specific digests differently, so such a request is
        // redirected away instead of filling the shared entry with its answer.
        cacheable: true,
        handler,
      });
      // Subscribed whatever the renderer makes: the featured-photo crop needs
      // no rasterizer, so it is the one link of the chain a deploy that cannot
      // render a card still gets.
      ctx.addFilter("seo:og_image", (image, data, appCtx, featured) =>
        pageOgImage({
          image,
          featured,
          data,
          ctx: appCtx,
          extension: advertised,
          cards,
          inputs: inputs(),
        }),
      );
      // Behind the development gate and a dynamic import, the way core mounts
      // its own dev-only routes: the branch is dead code in a build, so the
      // preview and the debug panel leave nothing in a production bundle.
      if (process.env.PLUMIX_DEV) {
        const { registerDevSurfaces } = await import("./dev/index.js");
        registerDevSurfaces(ctx, { renderer, cards, inputs });
      }
    },
  });
}
