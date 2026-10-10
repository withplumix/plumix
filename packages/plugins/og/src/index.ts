import type { PluginDescriptor } from "plumix/plugin";
import {
  definePlugin,
  PLUGIN_I18N_SLOT,
  pluginAdminEntryPath,
} from "plumix/plugin";

// Side-effect imports keep these augmentations in the declaration graph; tsc
// drops value-only edges.
import "@plumix/plugin-seo";
import "./chain-trace.js";

import type { CardInputs } from "./card-identity.js";
import type { CardPalette } from "./default-card.js";
import type { CardRenderer } from "./renderer.js";
import { planCardFonts } from "./card-fonts.js";
import { createCardRegistry } from "./card-registry.js";
import { CARD_ROUTE_PATH, createCardRoute } from "./card-route.js";
import { defaultCards } from "./default-card.js";
import { bundledRenderer } from "./default-renderer.js";
import { pageOgImage } from "./head.js";
import {
  CARD_PREVIEW_FIELD_KEY,
  CARD_PREVIEW_INPUT_TYPE,
} from "./preview-box.js";
import { advertisedExtension } from "./renderer.js";
import { createOgRouter } from "./rpc.js";
import { compileThemeTokens } from "./tokens.js";

/**
 * Where the built admin chunk sits once the package is installed. The vite
 * plugin resolves it from the consuming site's root and folds it into the
 * per-site admin bundle.
 */
const ADMIN_ENTRY_PATH = pluginAdminEntryPath("@plumix/plugin-og");

export type {
  CardArgs,
  CardDefinition,
  CardMode,
  CardRule,
  CardSelector,
} from "./card.js";
export { card } from "./card.js";
export type { CardPalette } from "./default-card.js";
export type { CardKey } from "./card-key.js";
export { cardKey } from "./card-key.js";
export type {
  CardContainerNode,
  CardFontSupport,
  CardImage,
  CardImageNode,
  CardNode,
  CardRenderer,
  CardRenderInput,
  CardTextNode,
  FontFormat,
} from "./renderer.js";
export { BUNDLED_ENGINE_FONTS } from "./renderer.js";
export type { CardPreview, CardPreviewOutcome } from "./preview.js";
export type { RemoteRendererOptions } from "./remote.js";
export { remote } from "./remote.js";

export interface OgPluginOptions {
  /**
   * Only PNG and JPEG reach the head; other formats are served but not
   * advertised. The bundled engine ships either way; only {@link remote} leaves
   * it unexecuted.
   */
  readonly renderer?: CardRenderer;
  /**
   * Asset-layer paths, in fallback order. The bundled engine can't parse WOFF2;
   * a set with no face the renderer parses fails the card.
   */
  readonly fonts?: readonly string[];
  /**
   * Entry types whose editor shows a card preview. An unregistered name fails
   * the boot.
   */
  readonly preview?: readonly string[];
  /**
   * Theme `color` token slugs for the default card. Each role defaults to a
   * slug of its own name; the theme palette applies only when all three
   * resolve.
   */
  readonly palette?: CardPalette;
}

/**
 * With no configuration, serves the bundled default card for every page kind.
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
  const preview = options.preview ?? [];
  const palette = options.palette;
  let tokens = compileThemeTokens({}, palette);
  const plan = planCardFonts(renderer, fonts);
  // One accessor for both readers: the head and the route have to land on the
  // same digest, and they only do that if they read the same inputs.
  const inputs = (): CardInputs => ({ fonts: plan, tokens });
  const handler = createCardRoute({ renderer, cards, inputs });
  // Advertising is decided by what the renderer declares it produces, not by a
  // flag of its own.
  const advertised = advertisedExtension(renderer.contentType);

  return definePlugin("og", {
    // The chunk only ships the preview renderer, dead weight without a box.
    ...(preview.length > 0 ? { adminEntry: ADMIN_ENTRY_PATH } : {}),
    i18n: PLUGIN_I18N_SLOT,
    // Async because of the dev import below; core awaits `setup` before it
    // reads any registry, so registration order is unaffected.
    setup: async (ctx) => {
      // The theme is validated after plugins install, so its cards arrive on
      // the boot-time handover rather than here. One snapshot serves every
      // request — nothing about a rule set is request-scoped.
      ctx.addAction("theme:ready", (theme) => {
        cards.load(theme.ogCards ?? []);
        tokens = compileThemeTokens(theme.tokens, palette);
      });
      ctx.registerRoute({
        method: "GET",
        path: CARD_ROUTE_PATH,
        auth: "public",
        // Content-addressing keeps it shared: a visitor-specific read digests
        // differently and is redirected away.
        cacheable: true,
        handler,
      });
      if (preview.length > 0) {
        // Under the same gate as `adminEntry`: the bundler only registers
        // from plugins that ship a chunk, so a declaration without one would
        // have the manifest advertise a type nothing renders.
        ctx.registerFieldType({
          type: CARD_PREVIEW_INPUT_TYPE,
          component: "CardPreviewField",
        });
        ctx.registerRpcRouter(
          createOgRouter({
            cards,
            renderer,
            inputs,
            extension: advertised,
            entryTypes: preview,
          }),
        );
        ctx.registerEntryMetaBox("card_preview", {
          label: {
            id: "plugin.og.preview.box.label",
            message: "Social card",
          },
          entryTypes: preview,
          fields: [
            {
              key: CARD_PREVIEW_FIELD_KEY,
              label: {
                id: "plugin.og.preview.field.label",
                message: "Shared image",
              },
              type: "json",
              inputType: CARD_PREVIEW_INPUT_TYPE,
            },
          ],
        });
      }
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
      if (process.env.PLUMIX_DEV) {
        const { registerDevSurfaces } = await import("./dev/index.js");
        registerDevSurfaces(ctx, { renderer, cards, inputs });
      }
    },
  });
}
