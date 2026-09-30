/**
 * The "current request entity" — populated by the public-route resolver
 * after URL → entity matching. Consumers (breadcrumbs, canonical tags,
 * the menu plugin's `isCurrent` detection) read it via `AppContext` to
 * answer "is this the page we're currently rendering."
 *
 * Entry-type archive routes set the `entryType` variant carrying the entry type
 * being listed. Single routes set the `entry` variant with the resolved
 * row id, and `preview` when a preview token's autosave was overlaid onto
 * it — the page then renders data no public URL serves, so anything
 * published on the page's behalf has to go back to the live row.
 * Term-archive routes set `term`; author archives set `author` with the
 * resolved user id.
 */
export type ResolvedEntity =
  | { readonly kind: "entry"; readonly id: number; readonly preview: boolean }
  | { readonly kind: "term"; readonly id: number }
  | { readonly kind: "author"; readonly id: number }
  | { readonly kind: "entryType"; readonly entryType: string };
