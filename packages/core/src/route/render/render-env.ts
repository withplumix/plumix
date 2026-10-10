import type { ReactNode } from "react";

import type { HtmlAllowlist } from "../../blocks/index.js";
import type { AppContext } from "../../context/app-context.js";
import type { DocumentManifest } from "../../document-manifest.js";
import type { EntryEditRow } from "../../entries/editability.js";
import type { RegisteredTemplateDep } from "../../template-deps.js";
import type { ThemeDescriptor } from "../../theme.js";
import type { AssetManifest } from "./asset-manifest.js";
import type { BlockCatalogs } from "./block-catalog.js";

/** Values fixed at app-build time; per-render inputs stay separate. */
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

/**
 * Filled by the composition root because the bars are surfaces the renderer may
 * not import. Edit mode renders neither.
 */
export interface RenderChrome {
  /**
   * Renders nothing for anyone but the staff principal the render phase decided
   * on.
   */
  readonly adminBar: (
    ctx: AppContext,
    queriedEntry: EntryEditRow | undefined,
  ) => ReactNode;
  /** Unset outside the dev server, so a build carries none of its modules. */
  readonly debugBar?: (ctx: AppContext) => ReactNode;
}
