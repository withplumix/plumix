// Declared apart from `BlockContext` so `shortcodes/types.ts` can name them
// too — that module sits below `render-block-tree.ts` in the import graph.

/**
 * The queried entry, spread flat so a block or shortcode can look a field up
 * by name. Not JSON: it arrives already hydrated by the field adapters, so a
 * `.returns("date")` field reads back as a `Date` and a reference as the
 * entity it points at.
 */
export type HydratedEntry = Readonly<Record<string, unknown>>;

/**
 * The `site` settings group as a flat `key → value` bag. Not JSON: pinned by
 * the `settings` column upstream, where a value goes in without passing the
 * field pipeline (see `settings.value` in core).
 */
export type SiteSettings = Readonly<Record<string, unknown>>;
