/**
 * The entity the public-route resolver matched for this request. `preview`
 * marks an overlaid autosave no public URL serves, so anything published on
 * the page's behalf uses the live row.
 */
export type ResolvedEntity =
  | { readonly kind: "entry"; readonly id: number; readonly preview: boolean }
  | { readonly kind: "term"; readonly id: number }
  | { readonly kind: "author"; readonly id: number }
  | { readonly kind: "entryType"; readonly entryType: string };
