import type { PluginDescriptor } from "plumix/plugin";
import {
  definePlugin,
  PLUGIN_I18N_SLOT,
  pluginAdminEntryPath,
} from "plumix/plugin";

// `@plumix/plugin-seo` declares the `seo:og_image` filter subscribed to below.
// The augmentation reaches this compilation only through an import of the
// package that declares it, and a side-effect import is the edge tsc keeps —
// same idiom as core's `public-hooks.ts` anchor (#1698).
import "@plumix/plugin-seo";
// Anchors this plugin's own `DebugPanelRegistry` augmentation — which makes
// `dev: { panels: { og: false } }` type-check on a site that installs it —
// into the published declaration graph. `chain-trace.js` is otherwise reached
// only transitively, and tsc keeps a side-effect edge where it drops a value
// one (#1698).
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

// Where the built admin chunk sits once the package is installed. The vite
// plugin resolves it from the consuming site's root and folds it into the
// per-site admin bundle.
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
   * so they cost nothing in the Worker bundle.
   *
   * Which formats are read is the renderer's business, not this option's: the
   * bundled engine parses TTF, OTF and WOFF but not WOFF2 — what most font
   * packages ship — while a `remote` endpoint may parse exactly the reverse.
   * Faces in a format the connected renderer does not parse are never fetched,
   * and a set with none it can parse fails the card rather than serving one
   * with no text on it. A renderer that reads no fonts at all ignores this
   * option entirely, which the debug bar points out in development.
   *
   * Left empty, the engine's own fallback face is used.
   */
  readonly fonts?: readonly string[];
  /**
   * Entry types whose editor shows a live preview of the card the entry will
   * be shared with, and which link of the `og:image` chain produced it.
   *
   * Named rather than defaulted: a meta box is registered against entry types
   * by name and an unregistered name fails the boot, so a guess here would
   * crash a site for installing a plugin.
   *
   * @example
   * ```ts
   * og({ preview: ["post", "page"] });
   * ```
   */
  readonly preview?: readonly string[];
  /**
   * Which of the theme's `color` tokens the bundled default card paints from:
   * its ground, its headline, and the site name beneath. Left out, each looks
   * for a slug of its own name — the convention a theme can adopt to get a card
   * in its own palette for declaring nothing here at all. Name only the roles
   * your theme spells differently.
   *
   * The card takes the theme's colours only when all three resolve. A theme
   * that names two of them keeps the bundled card's own palette rather than
   * mixing the two, because half a palette is what makes a card unreadable.
   *
   * A theme's own `ogCards` are unaffected — they style themselves from the
   * same tokens directly.
   *
   * @example
   * ```ts
   * og({ palette: { background: "paper", foreground: "ink", mutedForeground: "muted" } });
   * ```
   */
  readonly palette?: CardPalette;
}

/**
 * Generated social cards. Installing it and configuring nothing serves a card
 * for every page kind that has one — an entry, a term archive, a content-type
 * archive, an author, a date, the front page — at
 * `/_plumix/og/card/<target>/<digest>.<ext>`, composited from the bundled
 * default template: the page's own title over the site's name.
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
    // Only when a site asked for the box: the chunk exists to ship the
    // preview's field renderer, so with no box it would be dead weight folded
    // into every og install's admin bundle.
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
        // A card is one document for every visitor, and content-addressing is
        // what guarantees it rather than an absence of reads: a card that reads
        // something visitor-specific digests differently, so such a request is
        // redirected away instead of filling the shared entry with its answer.
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
