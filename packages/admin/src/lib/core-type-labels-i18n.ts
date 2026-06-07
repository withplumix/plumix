import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

// Extraction mirror for core's manifest-cascade label fallbacks (see
// `core-nav-i18n.ts` for the pattern). Rendering reads the descriptor
// off the manifest via `i18n._`. Lockstep with
// `packages/core/src/i18n/generic-type-labels.ts` is test-guarded.

export const CORE_TYPE_LABEL_DESCRIPTORS = {
  singular: defineMessage({ id: "type.generic.singular", message: "Item" }),
  plural: defineMessage({ id: "type.generic.plural", message: "Items" }),
  addNew: defineMessage({ id: "type.generic.addNew", message: "Add New" }),
  addNewItem: defineMessage({ id: "type.generic.addNewItem", message: "Add" }),
  editItem: defineMessage({ id: "type.generic.editItem", message: "Edit" }),
  newItem: defineMessage({ id: "type.generic.newItem", message: "New" }),
  viewItem: defineMessage({ id: "type.generic.viewItem", message: "View" }),
  viewItems: defineMessage({ id: "type.generic.viewItems", message: "View" }),
  searchItems: defineMessage({
    id: "type.generic.searchItems",
    message: "Search…",
  }),
  notFound: defineMessage({
    id: "type.generic.notFound",
    message: "Nothing yet",
  }),
  notFoundInTrash: defineMessage({
    id: "type.generic.notFoundInTrash",
    message: "Trash is empty",
  }),
  loadingItems: defineMessage({
    id: "type.generic.loadingItems",
    message: "Loading…",
  }),
  loadErrorItems: defineMessage({
    id: "type.generic.loadErrorItems",
    message: "Couldn’t load. Try again.",
  }),
  allItems: defineMessage({ id: "type.generic.allItems", message: "All" }),
  noMatch: defineMessage({ id: "type.generic.noMatch", message: "No matches" }),
  parentItem: defineMessage({
    id: "type.generic.parentItem",
    message: "Parent",
  }),
  parentItemColon: defineMessage({
    id: "type.generic.parentItemColon",
    message: "Parent:",
  }),
  untitledItem: defineMessage({
    id: "type.generic.untitledItem",
    message: "Untitled",
  }),
  moveToTrash: defineMessage({
    id: "type.generic.moveToTrash",
    message: "Move to trash?",
  }),
  itemUpdated: defineMessage({
    id: "type.generic.itemUpdated",
    message: "Updated",
  }),
  itemPublished: defineMessage({
    id: "type.generic.itemPublished",
    message: "Published",
  }),
  itemPublishedPrivately: defineMessage({
    id: "type.generic.itemPublishedPrivately",
    message: "Published privately",
  }),
  itemScheduled: defineMessage({
    id: "type.generic.itemScheduled",
    message: "Scheduled",
  }),
  itemTrashed: defineMessage({
    id: "type.generic.itemTrashed",
    message: "Moved to trash",
  }),
  itemRevertedToDraft: defineMessage({
    id: "type.generic.itemRevertedToDraft",
    message: "Reverted to draft",
  }),
  itemsList: defineMessage({ id: "type.generic.itemsList", message: "List" }),
  itemsListNavigation: defineMessage({
    id: "type.generic.itemsListNavigation",
    message: "List navigation",
  }),
  filterItemsList: defineMessage({
    id: "type.generic.filterItemsList",
    message: "Filter list",
  }),
  taxonomySingular: defineMessage({
    id: "type.generic.taxonomy.singular",
    message: "Term",
  }),
  taxonomyPlural: defineMessage({
    id: "type.generic.taxonomy.plural",
    message: "Terms",
  }),
  taxonomyUpdateItem: defineMessage({
    id: "type.generic.taxonomy.updateItem",
    message: "Update",
  }),
  taxonomyNewItemName: defineMessage({
    id: "type.generic.taxonomy.newItemName",
    message: "New name",
  }),
  taxonomyNoTerms: defineMessage({
    id: "type.generic.taxonomy.noTerms",
    message: "—",
  }),
  taxonomyFilterByItem: defineMessage({
    id: "type.generic.taxonomy.filterByItem",
    message: "Filter",
  }),
  taxonomyBackToItems: defineMessage({
    id: "type.generic.taxonomy.backToItems",
    message: "← Back",
  }),
  taxonomySeparateItemsWithCommas: defineMessage({
    id: "type.generic.taxonomy.separateItemsWithCommas",
    message: "Separate with commas",
  }),
  taxonomyAddOrRemoveItems: defineMessage({
    id: "type.generic.taxonomy.addOrRemoveItems",
    message: "Add or remove",
  }),
} satisfies Record<string, MessageDescriptor>;
