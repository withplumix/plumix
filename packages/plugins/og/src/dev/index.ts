import type { PluginSetupContext } from "plumix/plugin";

import type { CardInputs } from "../card-identity.js";
import type { CardRegistry } from "../card-registry.js";
import type { OgPageTrace } from "../chain-trace.js";
import type { CardRenderer } from "../renderer.js";
import { OG_PANEL_ID } from "../chain-trace.js";
import { ogDebugPanel } from "./panel.js";
import { createPreviewRoute, PREVIEW_ROUTE_PATH } from "./preview.js";

export interface DevSurfaceOptions {
  readonly renderer: CardRenderer;
  readonly cards: CardRegistry;
  /** The same accessor the head and the card route read, so a preview renders
   *  what a published card would. */
  readonly inputs: () => CardInputs;
}

/**
 * The two questions a card author asks constantly, both answerable in seconds:
 * "what does my card look like" (the preview route) and "why is my card not
 * showing" (the debug-bar panel).
 *
 * Reached only through the development gate's dynamic import, so this module
 * and everything below it are absent from a production build.
 */
export function registerDevSurfaces(
  ctx: PluginSetupContext,
  options: DevSurfaceOptions,
): void {
  const { renderer, cards, inputs } = options;
  ctx.registerRoute({
    method: "GET",
    path: PREVIEW_ROUTE_PATH,
    auth: "public",
    handler: createPreviewRoute({
      renderer,
      rules: () => cards.list(),
      inputs,
    }),
  });
  // Marks that a page render reached head assembly. The `seo:og_image` filter
  // does not run when an explicit `.ogImage()` role short-circuits the chain
  // above it, so without this the panel cannot tell that link from a request
  // that rendered no page at all.
  ctx.addFilter("render:document", (manifest, data, appCtx) => {
    appCtx.telemetry.record(OG_PANEL_ID, (): OgPageTrace => ({
      phase: "page",
      pageKind: data.kind,
    }));
    return manifest;
  });
  ctx.addFilter("debug_bar:panels", (panels) => [...panels, ogDebugPanel()]);
}
