/**
 * Stored in `entries.meta` for `menu_item` rows. The `entry` and `term`
 * variants are declared so the storage shape is settled now; their
 * resolvers land in slice 2.
 */
export type MenuItemMeta =
  | MenuItemCustomMeta
  | MenuItemEntryMeta
  | MenuItemTermMeta;

export interface MenuItemDisplayAttrs {
  readonly target?: "_blank";
  readonly rel?: string;
  readonly cssClasses?: readonly string[];
}

export interface MenuItemCustomMeta extends MenuItemDisplayAttrs {
  readonly kind: "custom";
  readonly url: string;
}

export interface MenuItemEntryMeta extends MenuItemDisplayAttrs {
  readonly kind: "entry";
  readonly entryId: number;
}

export interface MenuItemTermMeta extends MenuItemDisplayAttrs {
  readonly kind: "term";
  readonly termId: number;
}

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
  readonly children: readonly ResolvedMenuItem[];
}

export interface ResolvedMenu {
  readonly termId: number;
  readonly name: string;
  readonly slug: string;
  readonly items: readonly ResolvedMenuItem[];
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
