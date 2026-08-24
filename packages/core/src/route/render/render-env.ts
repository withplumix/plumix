import type { HtmlAllowlist } from "@plumix/blocks";

import type { RegisteredTemplateDep } from "../../template-deps.js";
import type { DocumentManifest, ThemeDescriptor } from "../../theme.js";
import type { AssetManifest } from "./asset-manifest.js";

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
}
