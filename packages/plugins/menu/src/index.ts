import { definePlugin } from "plumix/plugin";

import type { MenuLocationOptions, ResolvedMenuItem } from "./server/types.js";
import { createMenuRouter } from "./rpc.js";
import { recordLocation } from "./server/locations.js";

// `@plumix/plugin-menu` augments the theme setup context with
// `registerMenuLocation`, plus three core option shapes with
// menu-eligibility flags, plus the hook registries with three menu
// hooks. TypeScript surfaces all of these only when this plugin is
// in the project's `node_modules`. The runtime implementation of
// `registerMenuLocation` is wired via `extendThemeContext` below;
// the eligibility flags are read at admin time by the eligibility
// resolver (`getEligibleMenuKinds`); the hooks are fired by
// `getMenuByName` and `menu.save`.
declare module "plumix/plugin" {
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

  /**
   * Hook surface. `menu:item` runs per resolved item during tree
   * assembly (children resolve first, so subscribers see the
   * already-transformed subtree). `menu:tree` runs once after
   * assembly with `{ location, termId }` so a single subscriber can
   * branch by slot. `menu:saved` fires after every successful
   * `menu.save` commit — including no-op saves — so cache
   * invalidators don't need to sniff the payload to decide whether
   * to run.
   */
  interface FilterRegistry {
    "menu:tree": (
      items: readonly ResolvedMenuItem[],
      context: {
        readonly location: string | null;
        readonly termId: number;
      },
    ) => readonly ResolvedMenuItem[] | Promise<readonly ResolvedMenuItem[]>;

    "menu:item": (
      item: ResolvedMenuItem,
    ) => ResolvedMenuItem | Promise<ResolvedMenuItem>;
  }

  interface ActionRegistry {
    "menu:saved": (payload: {
      readonly termId: number;
      readonly addedIds: readonly number[];
      readonly removedIds: readonly number[];
      readonly modifiedIds: readonly number[];
    }) => void | Promise<void>;
  }
}

const ADMIN_ENTRY_PATH = "node_modules/@plumix/plugin-menu/dist/admin/index.js";

/**
 * `@plumix/plugin-menu` — menus reuse the entries/terms/entry_term substrate
 * rather than adding tables: a menu is a `terms` row (`taxonomy = 'menu'`),
 * a menu item is an `entries` row (`type = 'menu_item'`), and membership
 * lives in `entry_term`. Both types are `isPublic: false` so they hide from
 * the generic Entries/Terms admin; the plugin owns its own admin (slices 7+).
 */
export const menu = definePlugin("menu", {
  adminEntry: ADMIN_ENTRY_PATH,
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

    ctx.registerAdminPage({
      path: "/menus",
      title: "Menus",
      capability: "term:menu:manage",
      nav: {
        group: { id: "appearance", label: "Appearance", priority: 175 },
        label: "Menus",
        order: 10,
      },
      component: "MenusShell",
    });
  },
});
