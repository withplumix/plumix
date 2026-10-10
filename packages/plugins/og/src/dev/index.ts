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

/** Import only behind the development gate, so it stays out of production. */
export function registerDevSurfaces(
  ctx: PluginSetupContext,
  options: DevSurfaceOptions,
): void {
  const { renderer, cards, inputs } = options;
  ctx.registerRoute({
    method: "GET",
    path: PREVIEW_ROUTE_PATH,
    // Renders arbitrary template deps for a sessionless request, so dev server
    // and loopback only.
    auth: "development",
    handler: createPreviewRoute({
      renderer,
      rules: () => cards.list(),
      inputs,
    }),
  });
  // `seo:og_image` doesn't always fire, so the panel needs this to tell those
  // cases from a request that rendered no page.
  ctx.addFilter("render:document", (manifest, data, appCtx) => {
    appCtx.telemetry.record(OG_PANEL_ID, (): OgPageTrace => ({
      phase: "page",
      pageKind: data.kind,
    }));
    return manifest;
  });
  ctx.addFilter("debug:panels", (panels) => [
    ...panels,
    // The font plan is fixed for the plugin's life, so reading it once is safe.
    ogDebugPanel({ fonts: inputs().fonts }),
  ]);
}
