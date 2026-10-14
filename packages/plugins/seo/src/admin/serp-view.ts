import type { MessageDescriptor } from "plumix/i18n";

import type { IndexabilityReason } from "../indexable.js";
import { M } from "./messages.js";

/**
 * Keyed by reason so a new arm fails the build rather than showing a blank
 * line. `default` (offered to search engines) shows no line at all.
 */
const REASONS: Record<
  Exclude<IndexabilityReason, "default">,
  MessageDescriptor
> = {
  site_private: M.reasonSitePrivate,
  entry_override: M.reasonEntryOverride,
  type_default: M.reasonTypeDefault,
  taxonomy_default: M.reasonTaxonomyDefault,
  search_results: M.reasonSearchResults,
  paginated: M.reasonPaginated,
  not_found: M.reasonNotFound,
  view: M.reasonView,
};

export function exclusionReason(
  reason: IndexabilityReason,
): MessageDescriptor | null {
  return reason === "default" ? null : REASONS[reason];
}
