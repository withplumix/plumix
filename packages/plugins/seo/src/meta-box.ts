import type { PluginSetupContext } from "plumix/plugin";

import { SEO_BOX_LABELS, SEO_META_FIELDS } from "./overrides.js";

/**
 * Which entry types and taxonomies carry the SEO box.
 *
 * Scope is derived, not configured: everything publicly visible gets the box,
 * which excludes an internal type like a menu item for free. `exclude` is for
 * the exception — a type that is public but whose pages nobody writes search
 * copy for.
 */
export interface SeoMetaBoxOptions {
  /** Entry-type and taxonomy names that should not carry the box. */
  readonly exclude?: readonly string[];
}

// One id per surface. Entry and term boxes live in separate registries, so the
// same name on both reads as one box wherever it is rendered.
const BOX_ID = "seo";

/**
 * Put the SEO box on every publicly-visible entry type and taxonomy.
 *
 * Deferred to `theme:ready` because scope is read off the registry: during
 * `setup` it holds only what the plugins ahead of this one registered.
 */
export function registerSeoMetaBoxes(
  ctx: PluginSetupContext,
  options: SeoMetaBoxOptions,
): void {
  const excluded = new Set(options.exclude ?? []);
  // Entry types and taxonomies answer the same two questions, so one walk
  // serves both registries.
  const scopeOf = (
    targets: ReadonlyMap<
      string,
      { readonly name: string; readonly isPublic?: boolean }
    >,
  ): string[] =>
    [...targets.values()]
      .filter(
        (target) => target.isPublic !== false && !excluded.has(target.name),
      )
      .map((target) => target.name);

  ctx.addAction("theme:ready", () => {
    const entryTypes = scopeOf(ctx.plugins.entryTypes);
    // A box scoped to nothing renders nowhere, so registering one would put an
    // id and six meta keys on a site that has no page to write them for.
    if (entryTypes.length > 0) {
      ctx.registerEntryMetaBox(BOX_ID, {
        ...SEO_BOX_LABELS,
        entryTypes,
        fields: SEO_META_FIELDS,
      });
    }

    const termTaxonomies = scopeOf(ctx.plugins.termTaxonomies);
    if (termTaxonomies.length > 0) {
      ctx.registerTermMetaBox(BOX_ID, {
        ...SEO_BOX_LABELS,
        termTaxonomies,
        fields: SEO_META_FIELDS,
      });
    }
  });
}
