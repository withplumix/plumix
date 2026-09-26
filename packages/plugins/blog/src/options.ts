import type { EntryTypeOptions, TermTaxonomyOptions } from "plumix";
import type { Overridable } from "plumix/plugin";

/** `false` skips the registration entirely. */
export type EntryTypeOverride = Overridable<EntryTypeOptions> | false;
export type TermTaxonomyOverride = Overridable<TermTaxonomyOptions> | false;

export interface RelatedPostsOptions {
  /** Cards in the strip. Defaults to three. */
  readonly limit?: number;
}

export interface BlogOptions {
  readonly post?: EntryTypeOverride;
  readonly category?: TermTaxonomyOverride;
  readonly tag?: TermTaxonomyOverride;
  /**
   * The related-by-term strip on the single-post view. `false` skips the
   * template dep, so a theme that never declares `relatedPosts` pays nothing.
   */
  readonly relatedPosts?: false | RelatedPostsOptions;
}
