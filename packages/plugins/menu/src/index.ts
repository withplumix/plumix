import { definePlugin } from "@plumix/core";

import type { MenuLocationOptions } from "./server/types.js";
import { createMenuRouter } from "./rpc.js";
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
// `registerMenuLocation`, plus three core option shapes with
// menu-eligibility flags. TypeScript surfaces all of these only when
// this plugin is in the project's `node_modules`. The runtime
// implementation of `registerMenuLocation` is wired via
// `extendThemeContext` below; the eligibility flags are read at admin
// time by the eligibility resolver (`getEligibleMenuKinds`).
declare module "@plumix/core" {
  interface ThemeContextExtensions {
    registerMenuLocation: (id: string, options: MenuLocationOptions) => void;
  }
  interface EntryTypeOptions {
    /**
     * Whether this entry type appears in the menu plugin's item picker.
     * Defaults to `isPublic`. Mirrors WordPress's `show_in_nav_menus`.
     */
    readonly isShownInMenus?: boolean;
    /** Override the picker tab label. Defaults to `labels.plural`. */
    readonly menuPickerLabel?: string;
  }
  interface TermTaxonomyOptions {
    readonly isShownInMenus?: boolean;
    readonly menuPickerLabel?: string;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface LookupAdapterOptions<TScope = unknown> {
    /**
     * Opt-in for non-default kinds (`media`, `user`, future custom
     * kinds) to appear in the menu picker. Default kinds (`entry`,
     * `term`) follow `isShownInMenus`; other adapters are off unless
     * this is set.
     */
    readonly menuPicker?: { readonly tabLabel: string };
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

    ctx.registerRpcRouter(createMenuRouter());
  },
});
