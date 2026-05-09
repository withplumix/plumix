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
  /**
   * Snapshot of the linked entry's label/href at last sync (entered on
   * save and refreshed by the `entry:trashed` subscriber). Survives
   * source deletion so the admin can render broken items with their
   * last-known label and "Convert to Custom URL" can seed `meta.url`.
   */
  readonly lastLabel?: string;
  readonly lastHref?: string;
}

export interface MenuItemTermMeta extends MenuItemDisplayAttrs {
  readonly kind: "term";
  readonly termId: number;
  /** See `MenuItemEntryMeta.lastLabel` / `lastHref`. */
  readonly lastLabel?: string;
  readonly lastHref?: string;
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
  /**
   * True iff this item identifies the request's current entity (or
   * matches its pathname for `kind: 'custom'`). Computed via core's
   * `isCurrentSource(ctx, source)` helper at render time.
   */
  readonly isCurrent: boolean;
  /**
   * True iff any descendant in this menu's tree has `isCurrent: true`.
   * Menu-tree ancestry only — entity-tree ancestry (item links to a
   * page that's an ancestor of the current page in the entries tree)
   * is a `menu:item` filter consumer's job, not built-in.
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
