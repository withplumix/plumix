import type { Label } from "./label.js";

// Generic noun-less descriptors used as the cascade fallback for both
// `EntryTypeLabels` and `TermTaxonomyLabels`. `buildManifest` resolves
// the cascade server-side: every key the plugin author left unset is
// populated with the corresponding descriptor below, so consumers can
// read `entry.labels.editItem` directly without per-call-site
// fallback boilerplate. Substitution patterns like
// "Search {pluralLower}…" are deliberately excluded — they break in
// languages with case/gender agreement (DE/RU/PL/UK/AR) and translated
// nouns can't be safely lowercased. Plugin authors who want per-type
// translations declare them explicitly.

export const GENERIC_ENTRY_TYPE_LABELS = {
  // Identity
  singular: { id: "type.generic.singular", message: "Item" },
  plural: { id: "type.generic.plural", message: "Items" },
  // Create / read / update / delete actions
  addNewItem: { id: "type.generic.addNewItem", message: "Add" },
  editItem: { id: "type.generic.editItem", message: "Edit" },
  newItem: { id: "type.generic.newItem", message: "New" },
  viewItem: { id: "type.generic.viewItem", message: "View" },
  // List page chrome
  searchItems: { id: "type.generic.searchItems", message: "Search…" },
  notFound: { id: "type.generic.notFound", message: "Nothing yet" },
  notFoundInTrash: {
    id: "type.generic.notFoundInTrash",
    message: "Trash is empty",
  },
  loadingItems: { id: "type.generic.loadingItems", message: "Loading…" },
  loadErrorItems: {
    id: "type.generic.loadErrorItems",
    message: "Couldn’t load. Try again.",
  },
  allItems: { id: "type.generic.allItems", message: "All" },
  noMatch: { id: "type.generic.noMatch", message: "No matches" },
  parentItem: { id: "type.generic.parentItem", message: "Parent" },
  // Reference picker / lookup
  untitledItem: { id: "type.generic.untitledItem", message: "Untitled" },
  // Trash / status flow
  moveToTrash: {
    id: "type.generic.moveToTrash",
    message: "Move to trash?",
  },
  // Status-change toasts (mirror WP's `item_*` family)
  itemUpdated: { id: "type.generic.itemUpdated", message: "Updated" },
  itemPublished: { id: "type.generic.itemPublished", message: "Published" },
  itemPublishedPrivately: {
    id: "type.generic.itemPublishedPrivately",
    message: "Published privately",
  },
  itemScheduled: { id: "type.generic.itemScheduled", message: "Scheduled" },
  itemTrashed: { id: "type.generic.itemTrashed", message: "Moved to trash" },
  itemRevertedToDraft: {
    id: "type.generic.itemRevertedToDraft",
    message: "Reverted to draft",
  },
  // Accessibility region labels
  itemsList: { id: "type.generic.itemsList", message: "List" },
  itemsListNavigation: {
    id: "type.generic.itemsListNavigation",
    message: "List navigation",
  },
  filterItemsList: {
    id: "type.generic.filterItemsList",
    message: "Filter list",
  },
} as const satisfies Record<string, Label>;

export const GENERIC_TERM_TAXONOMY_LABELS = {
  singular: { id: "type.generic.taxonomy.singular", message: "Term" },
  addNewItem: { id: "type.generic.addNewItem", message: "Add" },
  editItem: { id: "type.generic.editItem", message: "Edit" },
  newItemName: {
    id: "type.generic.taxonomy.newItemName",
    message: "New name",
  },
  searchItems: { id: "type.generic.searchItems", message: "Search…" },
  notFound: { id: "type.generic.notFound", message: "Nothing yet" },
  loadingItems: { id: "type.generic.loadingItems", message: "Loading…" },
  loadErrorItems: {
    id: "type.generic.loadErrorItems",
    message: "Couldn’t load. Try again.",
  },
  allItems: { id: "type.generic.allItems", message: "All" },
  noMatch: { id: "type.generic.noMatch", message: "No matches" },
  parentItem: { id: "type.generic.parentItem", message: "Parent" },
  parentItemColon: {
    id: "type.generic.taxonomy.parentItemColon",
    message: "Parent:",
  },
  noTerms: { id: "type.generic.taxonomy.noTerms", message: "—" },
  filterByItem: {
    id: "type.generic.taxonomy.filterByItem",
    message: "Filter",
  },
  backToItems: {
    id: "type.generic.taxonomy.backToItems",
    message: "← Back",
  },
} as const satisfies Record<string, Label>;
