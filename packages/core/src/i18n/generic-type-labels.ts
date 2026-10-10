import type { Label } from "./label.js";

/**
 * No "Search {pluralLower}…" substitution patterns: they break under case or
 * gender agreement, and translated nouns can't be safely lowercased.
 */
export const GENERIC_ENTRY_TYPE_LABELS = {
  // Identity
  singular: { id: "type.generic.singular", message: "Item" },
  plural: { id: "type.generic.plural", message: "Items" },
  // Create / read / update / delete actions
  addNew: { id: "type.generic.addNew", message: "Add New" },
  addNewItem: { id: "type.generic.addNewItem", message: "Add" },
  editItem: { id: "type.generic.editItem", message: "Edit" },
  newItem: { id: "type.generic.newItem", message: "New" },
  viewItem: { id: "type.generic.viewItem", message: "View" },
  viewItems: { id: "type.generic.viewItems", message: "View" },
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
  parentItemColon: {
    id: "type.generic.parentItemColon",
    message: "Parent:",
  },
  // Reference picker / lookup
  untitledItem: { id: "type.generic.untitledItem", message: "Untitled" },
  // Trash / status flow
  moveToTrash: {
    id: "type.generic.moveToTrash",
    message: "Move to trash?",
  },
} as const satisfies Record<string, Label>;

export const GENERIC_TERM_TAXONOMY_LABELS = {
  singular: { id: "type.generic.taxonomy.singular", message: "Term" },
  plural: { id: "type.generic.taxonomy.plural", message: "Terms" },
  addNew: { id: "type.generic.addNew", message: "Add New" },
  addNewItem: { id: "type.generic.addNewItem", message: "Add" },
  editItem: { id: "type.generic.editItem", message: "Edit" },
  viewItem: { id: "type.generic.viewItem", message: "View" },
  updateItem: {
    id: "type.generic.taxonomy.updateItem",
    message: "Update",
  },
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
    id: "type.generic.parentItemColon",
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
  // WP-parity additions
  itemsList: { id: "type.generic.itemsList", message: "List" },
  itemsListNavigation: {
    id: "type.generic.itemsListNavigation",
    message: "List navigation",
  },
  separateItemsWithCommas: {
    id: "type.generic.taxonomy.separateItemsWithCommas",
    message: "Separate with commas",
  },
  addOrRemoveItems: {
    id: "type.generic.taxonomy.addOrRemoveItems",
    message: "Add or remove",
  },
} as const satisfies Record<string, Label>;
