/**
 * Reserved entry-meta key holding an author's `named`-template choice. Kept
 * dependency-free so `revisions/` can read it without importing the resolver.
 */
export const NAMED_TEMPLATE_META_KEY = "__plumix_template";

/** An author-selectable `named` template, surfaced to the editor picker. */
export interface NamedTemplateChoice {
  readonly id: string;
  readonly label: string;
}
