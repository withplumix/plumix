import type { MessageDescriptor } from "plumix/i18n";

// Descriptors for the entry-editor SERP preview. Kept in their own module so
// the reason table below and the component read one source, and so a catalog
// extraction sees every string in one place.
export const M = {
  loading: {
    id: "plugin.seo.preview.loading",
    message: "Loading…",
  },
  failed: {
    id: "plugin.seo.preview.failed",
    message: "Could not load the preview.",
  },
  unsaved: {
    id: "plugin.seo.preview.unsaved",
    message: "Save the entry to see how it will look in search results.",
  },
  refresh: {
    id: "plugin.seo.preview.refresh",
    message: "Refresh",
  },
  titleCounter: {
    id: "plugin.seo.preview.counter.title",
    message: "Title",
  },
  descriptionCounter: {
    id: "plugin.seo.preview.counter.description",
    message: "Description",
  },
  withinLimit: {
    id: "plugin.seo.preview.counter.ok",
    message: "Fits.",
  },
  overLimit: {
    id: "plugin.seo.preview.counter.over",
    message: "Too long — search engines will cut it short.",
  },
  empty: {
    id: "plugin.seo.preview.counter.empty",
    message: "Empty.",
  },
  excluded: {
    id: "plugin.seo.preview.excluded",
    message: "Not offered to search engines.",
  },
  // Why a page is out, in the words an author can act on — the reason the
  // chain carries, spelled out rather than shown as a bare toggle.
  reasonSitePrivate: {
    id: "plugin.seo.preview.reason.site_private",
    message: "The whole site is held out of search.",
  },
  reasonEntryOverride: {
    id: "plugin.seo.preview.reason.entry_override",
    message: "Hidden from search engines on this entry.",
  },
  reasonTypeDefault: {
    id: "plugin.seo.preview.reason.type_default",
    message: "This content type is held out of search in settings.",
  },
  reasonTaxonomyDefault: {
    id: "plugin.seo.preview.reason.taxonomy_default",
    message: "This taxonomy is held out of search in settings.",
  },
  reasonSearchResults: {
    id: "plugin.seo.preview.reason.search_results",
    message: "Search-result pages are held out of search in settings.",
  },
  reasonPaginated: {
    id: "plugin.seo.preview.reason.paginated",
    message: "Page two and beyond are held out of search in settings.",
  },
  reasonNotFound: {
    id: "plugin.seo.preview.reason.not_found",
    message: "Pages that were not found are held out of search in settings.",
  },
} as const satisfies Record<string, MessageDescriptor>;
