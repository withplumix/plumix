import type { PluginDescriptor } from "plumix/plugin";
import { definePlugin } from "plumix/plugin";

import type { CardRenderer } from "./renderer.js";
import { CARD_ROUTE_PATH, createCardRoute } from "./card-route.js";
import { bundledRenderer } from "./default-renderer.js";

export type {
  CardContainerNode,
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
   * this package; `svgOnly()` and `takumi()` on the `/takumi` subpath and
   * {@link remote} are the shipped alternatives.
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
 * per published entry at `/_plumix/og/entry/<id>.<ext>`, composited from the
 * bundled default template — the entry's title over the site's name.
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
  const handler = createCardRoute({ renderer, fonts: options.fonts ?? [] });

  return definePlugin("og", {
    setup: (ctx) => {
      ctx.registerRoute({
        method: "GET",
        path: CARD_ROUTE_PATH,
        auth: "public",
        handler,
      });
    },
  });
}
