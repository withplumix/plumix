import { definePlugin } from "@plumix/core";

import type { MenuLocationOptions } from "./server/types.js";
import { recordLocation } from "./server/locations.js";

export type {
  MenuItemMeta,
  MenuItemCustomMeta,
  MenuItemEntryMeta,
  MenuItemTermMeta,
  MenuItemDisplayAttrs,
  MenuLocationOptions,
  RegisteredMenuLocation,
  ResolvedMenu,
  ResolvedMenuItem,
  ResolvedMenuItemSource,
} from "./server/types.js";

// `@plumix/plugin-menu` augments the theme setup context with
// `registerMenuLocation`. TypeScript surfaces the method only when this
// plugin is in the project's `node_modules`; the implementation is wired
// at install time via `extendThemeContext` from the plugin's `provides`
// callback below.
declare module "@plumix/core" {
  interface ThemeContextExtensions {
    registerMenuLocation: (id: string, options: MenuLocationOptions) => void;
  }
}

/**
 * `@plumix/plugin-menu` — menus reuse the entries/terms/entry_term substrate
 * rather than adding tables: a menu is a `terms` row (`taxonomy = 'menu'`),
 * a menu item is an `entries` row (`type = 'menu_item'`), and membership
 * lives in `entry_term`. Both types are `isPublic: false` so they hide from
 * the generic Entries/Terms admin; the plugin owns its own admin (slices 7+).
 */
export const menu = definePlugin("menu", {
  provides: (ctx) => {
    ctx.extendThemeContext("registerMenuLocation", (id, options) => {
      recordLocation(id, options);
    });
  },
  setup: (ctx) => {
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
  },
});
