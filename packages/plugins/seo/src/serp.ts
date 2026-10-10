import type { IndexabilityReason } from "./indexable.js";

/**
 * Google truncates by pixels; these conventional character counts approximate
 * it.
 */
export const SERP_TITLE_LIMIT = 60;
export const SERP_DESCRIPTION_LIMIT = 155;

/**
 * `indexable` and `reason` leave out the entry's own `noindex`, so the editor
 * can overlay the unsaved toggle.
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
 * On a private site the reason stays `site_private` whatever the author's
 * `noindex` toggle says.
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
