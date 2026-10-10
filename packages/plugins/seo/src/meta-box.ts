import type { PluginAfterSetupContext } from "plumix/plugin";

import type { PublicTarget } from "./scope.js";
import {
  SEO_BOX_LABELS,
  SEO_ENTRY_FIELDS,
  SEO_META_FIELDS,
} from "./overrides.js";
import { SERP_PREVIEW_FIELD } from "./preview-box.js";
import { createSeoRouter } from "./rpc.js";
import { publicTargets } from "./scope.js";

/**
 * Every publicly visible entry type and taxonomy gets the box unless excluded.
 */
export interface SeoMetaBoxOptions {
  /** Entry-type and taxonomy names that should not carry the box. */
  readonly exclude?: readonly string[];
}

/**
 * One id per surface. Entry and term boxes live in separate registries, so the
 * same name on both reads as one box wherever it is rendered.
 */
const BOX_ID = "seo";

/**
 * Also registers the preview procedure, so it answers for exactly the types
 * that carry the box.
 */
export function registerSeoEditorSurfaces(
  ctx: PluginAfterSetupContext,
  options: SeoMetaBoxOptions,
): void {
  const excluded = new Set(options.exclude ?? []);
  const scopeOf = (targets: ReadonlyMap<string, PublicTarget>): string[] =>
    publicTargets(targets)
      .map((target) => target.name)
      .filter((name) => !excluded.has(name));

  const entryTypes = scopeOf(ctx.plugins.entryTypes);
  // A box scoped to nothing renders nowhere, so registering one would put an
  // id and six meta keys on a site that has no page to write them for.
  if (entryTypes.length > 0) {
    ctx.registerRpcRouter(createSeoRouter({ entryTypes }));
    ctx.registerEntryMetaBox(BOX_ID, {
      ...SEO_BOX_LABELS,
      entryTypes,
      // The preview leads, the way it does in the editor it describes: an
      // author reads the result first and edits the fields under it.
      fields: [SERP_PREVIEW_FIELD, ...SEO_ENTRY_FIELDS],
    });
  }

  const termTaxonomies = scopeOf(ctx.plugins.termTaxonomies);
  if (termTaxonomies.length > 0) {
    ctx.registerTermMetaBox(BOX_ID, {
      ...SEO_BOX_LABELS,
      termTaxonomies,
      // No preview: it is written from an entry's own permalink and excerpt,
      // and a term archive has neither.
      fields: SEO_META_FIELDS,
    });
  }
}
