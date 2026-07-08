import type { Label } from "plumix/i18n";
import type {
  EntryTypeLabels,
  PluginDescriptor,
  TermTaxonomyLabels,
} from "plumix/plugin";
import { definePlugin } from "plumix/plugin";

import type {
  MenuLocationOptions,
  ResolvedMenu,
  ResolvedMenuItem,
} from "./server/types.js";
import { createMenuRouter } from "./rpc.js";
import { getMenuByName } from "./server/getMenuByName.js";
import {
  clearRegisteredLocations,
  recordLocation,
} from "./server/locations.js";

// Plain descriptor literals — plugin source runs server-side without
// the Babel macro pipeline. Per-entity tables (`MENU_ITEM_LABELS` /
// `MENU_LABELS`) `satisfies` the matching schema so typo-renames in
// label keys fail compile rather than silently cascade to generic.

const MENU_ITEM_LABELS = {
  singular: {
    id: "plugin.menu.menuItem.singular",
    message: "Menu item",
  },
  plural: { id: "plugin.menu.menuItem.plural", message: "Menu items" },
  addNew: { id: "plugin.menu.menuItem.addNew", message: "Add New" },
  addNewItem: {
    id: "plugin.menu.menuItem.addNewItem",
    message: "Add Menu Item",
  },
  editItem: {
    id: "plugin.menu.menuItem.editItem",
    message: "Edit Menu Item",
  },
  newItem: {
    id: "plugin.menu.menuItem.newItem",
    message: "New Menu Item",
  },
  searchItems: {
    id: "plugin.menu.menuItem.searchItems",
    message: "Search menu items…",
  },
  notFound: {
    id: "plugin.menu.menuItem.notFound",
    message: "No menu items yet",
  },
  parentItem: {
    id: "plugin.menu.menuItem.parentItem",
    message: "Parent Item",
  },
} satisfies EntryTypeLabels;

const MENU_LABELS = {
  singular: { id: "plugin.menu.menu.singular", message: "Menu" },
  plural: { id: "plugin.menu.menu.plural", message: "Menus" },
  addNew: { id: "plugin.menu.menu.addNew", message: "Add New" },
  addNewItem: {
    id: "plugin.menu.menu.addNewItem",
    message: "Add Menu",
  },
  editItem: {
    id: "plugin.menu.menu.editItem",
    message: "Edit Menu",
  },
  viewItem: {
    id: "plugin.menu.menu.viewItem",
    message: "View Menu",
  },
  updateItem: {
    id: "plugin.menu.menu.updateItem",
    message: "Update Menu",
  },
  newItemName: {
    id: "plugin.menu.menu.newItemName",
    message: "New Menu Name",
  },
  searchItems: {
    id: "plugin.menu.menu.searchItems",
    message: "Search menus…",
  },
  notFound: { id: "plugin.menu.menu.notFound", message: "No menus yet" },
  allItems: { id: "plugin.menu.menu.allItems", message: "All Menus" },
  backToItems: {
    id: "plugin.menu.menu.backToItems",
    message: "← Back to Menus",
  },
} satisfies TermTaxonomyLabels;

// Shared admin-nav group label (cross-plugin convention).
const APPEARANCE_LABEL: Label = {
  id: "core.adminNav.appearance",
  message: "Appearance",
};

// `@plumix/plugin-menu` augments the core option shapes with
// menu-eligibility flags and the hook registries with three menu
// hooks. TypeScript surfaces all of these only when this plugin is
// in the project's `node_modules`. The eligibility flags are read at
// admin time by the eligibility resolver (`getEligibleMenuKinds`);
// the hooks are fired by `getMenuByName` and `menu.save`.
declare module "plumix/plugin" {
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

export interface MenuPluginOptions {
  /**
   * Navigation slots the site's theme renders, keyed by location id;
   * the label shows in the admin Locations tab. Replaces the
   * registration path lost when `theme.setup` went away — the theme
   * renders the slots, but the consumer config declares them.
   */
  readonly locations?: Readonly<Record<string, MenuLocationOptions>>;
}

/**
 * `@plumix/plugin-menu` — menus reuse the entries/terms/entry_term substrate
 * rather than adding tables: a menu is a `terms` row (`taxonomy = 'menu'`),
 * a menu item is an `entries` row (`type = 'menu_item'`), and membership
 * lives in `entry_term`. Both types are `isPublic: false` so they hide from
 * the generic Entries/Terms admin; the plugin owns its own admin (slices 7+).
 */
export function menu(
  options: MenuPluginOptions = {},
): PluginDescriptor<undefined> {
  return definePlugin("menu", {
    adminEntry: ADMIN_ENTRY_PATH,
    i18n: {
      sourceLocale: "en",
      locales: ["en"],
      catalogPath: "./locales",
    },
    setup: (ctx) => {
      // Reset-then-populate: setup re-runs across dev rebuilds within
      // one module lifetime, and each build must own the full location
      // set — a removed config entry has to actually disappear.
      clearRegisteredLocations();
      for (const [id, location] of Object.entries(options.locations ?? {})) {
        recordLocation(id, location);
      }

      ctx.registerEntryType("menu_item", {
        label: MENU_ITEM_LABELS.plural,
        labels: MENU_ITEM_LABELS,
        description: "Items belonging to a navigation menu",
        supports: ["title"],
        termTaxonomies: ["menu"],
        isHierarchical: true,
        isPublic: false,
        capabilityType: "menu_item",
      });

      ctx.registerTermTaxonomy("menu", {
        label: MENU_LABELS.plural,
        labels: MENU_LABELS,
        isHierarchical: false,
        entryTypes: ["menu_item"],
        isPublic: false,
      });

      ctx.registerTemplateDep("menus", {
        load: async (slugs, appCtx) => {
          const result: Record<string, ResolvedMenu | null> = {};
          await Promise.all(
            slugs.map(async (slug) => {
              result[slug] = await getMenuByName(appCtx, slug);
            }),
          );
          return result;
        },
      });

      ctx.registerRpcRouter(createMenuRouter());

      ctx.registerAdminPage({
        path: "/menus",
        title: MENU_LABELS.plural,
        capability: "term:menu:manage",
        nav: {
          group: { id: "appearance", label: APPEARANCE_LABEL, priority: 175 },
          label: MENU_LABELS.plural,
          order: 10,
          keywords: [
            { id: "plugin.menu.keyword.navigation", message: "navigation" },
            { id: "plugin.menu.keyword.nav", message: "nav" },
            { id: "plugin.menu.keyword.appearance", message: "appearance" },
            { id: "plugin.menu.keyword.header", message: "header" },
            { id: "plugin.menu.keyword.footer", message: "footer" },
          ],
        },
        component: "MenusShell",
      });
    },
  });
}
