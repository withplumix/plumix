import type { IndexabilityReason } from "./indexable.js";

/**
 * Where Google truncates a result. Both are pixel budgets really, so these are
 * the conventional character counts that approximate them — a counter that
 * warns a little early costs an author nothing, one that warns late costs them
 * the end of their sentence.
 */
export const SERP_TITLE_LIMIT = 60;
export const SERP_DESCRIPTION_LIMIT = 155;

/**
 * What one entry resolves to before its author's own overrides — the answer
 * only the server can give, because it reads the site settings, the type's
 * title pattern and the permalink.
 *
 * `indexable` and `reason` are the chain's answer with the entry's own
 * `noindex` flag left out, so the editor can overlay the toggle the author is
 * holding rather than the one that was last saved.
 */
export interface SerpPreview {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly indexable: boolean;
  readonly reason: IndexabilityReason;
}

/** The three answers the editor is holding live, unsaved. */
export interface SerpOverrides {
  readonly title: string | null;
  readonly description: string | null;
  readonly noindex: boolean;
}

/** A search result as it would look right now. */
export interface SerpResult {
  readonly title: string;
  readonly description: string;
  readonly indexable: boolean;
  readonly reason: IndexabilityReason;
}

/**
 * Lay the editor's unsaved answers over the resolved page.
 *
 * The `noindex` arm sits below the site-wide one in the chain, so a site held
 * out of the index keeps saying so — an author toggling the flag on a private
 * site is told the site is why, not their own toggle.
 */
export function resolveSerp(
  preview: SerpPreview,
  overrides: SerpOverrides,
): SerpResult {
  const excluded = overrides.noindex && preview.reason !== "site_private";
  return {
    title: overrides.title ?? preview.title,
    description: overrides.description ?? preview.description,
    indexable: preview.indexable && !excluded,
    reason: excluded ? "entry_override" : preview.reason,
  };
}
