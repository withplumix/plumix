import type { ReactNode } from "react";

import type { HtmlAllowlist } from "../../blocks/index.js";
import type { AppContext } from "../../context/app-context.js";
import type { RegisteredTemplateDep } from "../../template-deps.js";
import type { DocumentManifest, ThemeDescriptor } from "../../theme.js";
import type { AssetManifest } from "./asset-manifest.js";
import type { BlockCatalogs } from "./block-catalog.js";

/**
 * The app-level render environment — the values fixed at app-build time that
 * every public render reads: the theme descriptor, the base document manifest,
 * the template-dependency map, the asset manifest, and the sanitizer allowlist
 * the blocks that render stored HTML are held to.
 *
 * Bundled into one interface so `resolvePublicRoute`, the per-intent resolvers,
 * and the render entry point thread a single parameter instead of a
 * positional list. Computed once in `buildApp` and carried on the app; a new
 * render dependency is then a one-field change here, not a cross-file signature
 * edit. The per-render inputs (node, data, title, edit-mode) stay separate
 * because they genuinely vary per render.
 */
export interface RenderEnv {
  readonly theme: ThemeDescriptor;
  readonly document: DocumentManifest;
  readonly templateDeps: ReadonlyMap<string, RegisteredTemplateDep>;
  readonly assetManifest: AssetManifest;
  readonly htmlAllowlist: HtmlAllowlist;
  /** The catalog a block's `render` resolves its strings from, per locale. */
  readonly blockCatalogs: BlockCatalogs;
  /** What a page renders beside its template; see {@link RenderChrome}. */
  readonly chrome: RenderChrome;
}

/** The entry a page renders, as the admin bar's edit link reads it. */
export interface QueriedEntryDetails {
  readonly type: string;
  readonly canEdit: boolean;
}

/**
 * The bars a live or preview page carries after its template, inside the same
 * provider so they read the request's user. The composition root fills it:
 * both bars are surfaces, which the renderer may not import. Edit mode renders
 * neither.
 */
export interface RenderChrome {
  /** The front-end admin bar. It renders nothing for an anonymous visitor. */
  readonly adminBar: (
    ctx: AppContext,
    queriedEntryDetails: QueriedEntryDetails | undefined,
  ) => ReactNode;
  /**
   * The dev debug bar. Unset outside the dev server, so a build carries none
   * of its modules.
   */
  readonly debugBar?: (ctx: AppContext) => ReactNode;
}
