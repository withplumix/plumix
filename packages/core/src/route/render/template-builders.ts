import type {
  GenericTier,
  TemplateData,
  TemplateEntry,
  TemplateRule,
} from "../../theme.js";
import type {
  ArchiveData,
  EntryData,
  ErrorData,
  FrontPageData,
  SearchData,
  TaxonomyData,
} from "./resolved-entry.js";

// The per-tier data type is erased to the union in the stored rule. Each
// builder types its input to the tier's data shape (so `data.entry`/`data.term`
// are typed at the call site), then erases on output — the resolver only ever
// invokes a rule's template with the matching node's data, so the erasure is
// sound and it keeps the `templates` array a homogeneous element type.
function rule<Data extends TemplateData>(
  tier: GenericTier,
  template: TemplateEntry<Data>,
): TemplateRule {
  return { tier, template: template as unknown as TemplateEntry<TemplateData> };
}

/** Universal catch-all — matches any resolved node. */
export function fallback(template: TemplateEntry<TemplateData>): TemplateRule {
  return rule("fallback", template);
}

/** A single entry (any type). */
export function entry(template: TemplateEntry<EntryData>): TemplateRule {
  return rule("entry", template);
}

/** A content-type archive listing. */
export function archive(template: TemplateEntry<ArchiveData>): TemplateRule {
  return rule("archive", template);
}

/** A term archive (any taxonomy). */
export function taxonomy(template: TemplateEntry<TaxonomyData>): TemplateRule {
  return rule("taxonomy", template);
}

/** The static front page. */
export function frontPage(
  template: TemplateEntry<FrontPageData>,
): TemplateRule {
  return rule("frontPage", template);
}

/** The posts listing (blog home). */
export function postsPage(
  template: TemplateEntry<FrontPageData>,
): TemplateRule {
  return rule("postsPage", template);
}

/** Search results. */
export function search(template: TemplateEntry<SearchData>): TemplateRule {
  return rule("search", template);
}

/** The 404 handler. */
export function notFound(template: TemplateEntry<ErrorData>): TemplateRule {
  return rule("notFound", template);
}

/** The 500 handler. */
export function serverError(template: TemplateEntry<ErrorData>): TemplateRule {
  return rule("serverError", template);
}
