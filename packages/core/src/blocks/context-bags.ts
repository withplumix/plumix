import type { JsonObject } from "../json.js";

// Declared apart from `BlockContext` so `shortcodes/types.ts` can name them
// too — that module sits below `render-block-tree.ts` in the import graph.

/**
 * Not JSON: already hydrated by the field adapters, so a date field reads as
 * a `Date` and a reference as its entity.
 */
export type HydratedEntry = Readonly<Record<string, unknown>>;

/** The `site` settings group as a flat `key → value` bag — the `settings`
 *  column upstream, which the field pipeline decodes on the way in. */
export type SiteSettings = JsonObject;
