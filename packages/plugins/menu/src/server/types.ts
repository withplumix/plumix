/**
 * Stored in `entries.meta` for `menu_item` rows. The `entry` and `term`
 * variants are declared so the storage shape is settled now; their
 * resolvers land in slice 2.
 */
export type MenuItemMeta =
  MenuItemCustomMeta | MenuItemEntryMeta | MenuItemTermMeta;

// `Readonly<{…}>`, not interfaces: an interface gets no implicit index
// signature, so it wouldn't be assignable to the JSON `entries.meta` column.
export type MenuItemDisplayAttrs = Readonly<{
  target?: "_blank";
  rel?: string;
  cssClasses?: readonly string[];
}>;

export type MenuItemCustomMeta = MenuItemDisplayAttrs &
  Readonly<{
    kind: "custom";
    url: string;
  }>;

export type MenuItemEntryMeta = MenuItemDisplayAttrs &
  Readonly<{
    kind: "entry";
    entryId: number;
    /**
     * Written by the server on each save the target resolves on; survives its
     * deletion so broken items keep a label.
     */
    lastLabel?: string;
    lastHref?: string;
  }>;

export type MenuItemTermMeta = MenuItemDisplayAttrs &
  Readonly<{
    kind: "term";
    termId: number;
    /** See `MenuItemEntryMeta.lastLabel` / `lastHref`. */
    lastLabel?: string;
    lastHref?: string;
  }>;

/**
 * `entry` / `term` carry the linked id so downstream code (hook
 * subscribers, render filters) can re-fetch without re-parsing meta.
 */
export type ResolvedMenuItemSource =
  | { readonly kind: "custom" }
  | { readonly kind: "entry"; readonly id: number }
  | { readonly kind: "term"; readonly id: number };

export interface ResolvedMenuItem {
  readonly id: number;
  readonly parentId: number | null;
  readonly label: string;
  readonly href: string;
  readonly target?: "_blank";
  readonly rel?: string;
  readonly cssClasses: readonly string[];
  readonly source: ResolvedMenuItemSource;
  /**
   * True iff this item identifies the request's current entity (or
   * matches its pathname for `kind: 'custom'`). Computed via core's
   * `isCurrentSource(ctx, source)` helper at render time.
   */
  readonly isCurrent: boolean;
  /**
   * Menu-tree ancestry only; entity-tree ancestry is left to `menu:item`
   * filters.
   */
  readonly isAncestor: boolean;
  readonly children: readonly ResolvedMenuItem[];
}

export interface ResolvedMenu {
  readonly termId: number;
  readonly name: string;
  readonly slug: string;
  readonly items: readonly ResolvedMenuItem[];
}

// Lives here (not main entry) so themes pulling /server types pick
// up the augmentation without a side-effect import on the main entry.
declare module "plumix" {
  interface TemplateDepRegistry {
    menus: { location: string; result: ResolvedMenu };
  }
}

/**
 * Theme-side input for `registerMenuLocation`. The label appears in the
 * admin Locations panel (slice 7+); description is optional helper text.
 */
export interface MenuLocationOptions {
  readonly label: string;
  readonly description?: string;
}

export interface RegisteredMenuLocation extends MenuLocationOptions {
  readonly id: string;
}
