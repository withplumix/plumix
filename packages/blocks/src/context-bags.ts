import type { JsonObject } from "./json.js";

// Declared apart from `BlockContext` so `shortcodes/types.ts` can name them
// too — that module sits below `render-block-tree.ts` in the import graph.

/**
 * The queried entry, spread flat so a block or shortcode can look a field up
 * by name. Not JSON: it arrives already hydrated by the field adapters, so a
 * `.returns("date")` field reads back as a `Date` and a reference as the
 * entity it points at.
 */
export type HydratedEntry = Readonly<Record<string, unknown>>;

/** The `site` settings group as a flat `key → value` bag — the `settings`
 *  column upstream, which the field pipeline decodes on the way in. */
export type SiteSettings = JsonObject;
