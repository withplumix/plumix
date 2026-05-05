import { definePlugin } from "@plumix/core";

export type {
  MenuItemMeta,
  MenuItemCustomMeta,
  MenuItemEntryMeta,
  MenuItemTermMeta,
  MenuItemDisplayAttrs,
  ResolvedMenu,
  ResolvedMenuItem,
  ResolvedMenuItemSource,
} from "./server/types.js";

/**
 * `@plumix/plugin-menu` — menus reuse the entries/terms/entry_term substrate
 * rather than adding tables: a menu is a `terms` row (`taxonomy = 'menu'`),
 * a menu item is an `entries` row (`type = 'menu_item'`), and membership
 * lives in `entry_term`. Both types are `isPublic: false` so they hide from
 * the generic Entries/Terms admin; the plugin owns its own admin (slices 7+).
 */
export const menu = definePlugin("menu", (ctx) => {
  ctx.registerEntryType("menu_item", {
    label: "Menu items",
    labels: { singular: "Menu item", plural: "Menu items" },
    description: "Items belonging to a navigation menu",
    supports: ["title"],
    termTaxonomies: ["menu"],
    isHierarchical: true,
    isPublic: false,
    capabilityType: "menu_item",
  });

  ctx.registerTermTaxonomy("menu", {
    label: "Menus",
    labels: { singular: "Menu" },
    isHierarchical: false,
    entryTypes: ["menu_item"],
    isPublic: false,
  });
});
