import type { MessageDescriptor } from "plumix/i18n";
import { ORPCError } from "@orpc/client";

import type { EditorAction, EditorItem, ItemKey } from "./editor-state.js";
import type { LinkTarget, MenuListItem, PickerTab } from "./queries.js";

/** Plain literals: the package builds with plain `tsc`, no Lingui macro pass. */
const M = {
  addedAnnouncement: {
    id: "plugin.menu.itemEditor.addedAnnouncement",
    message: "Added {label} to the menu",
    comment: "label: the title of the entry or term just added",
  },
  replacedAnnouncement: {
    id: "plugin.menu.itemEditor.replacedAnnouncement",
    message: "Replaced the link with {label}",
    comment: "label: the title of the entry or term the item now links to",
  },
  linkedTarget: {
    id: "plugin.menu.itemEditor.linkedTarget",
    message: "Links to {label}",
    comment: "label: the title of the entry or term the item links to",
  },
  linkedEntryById: {
    id: "plugin.menu.itemEditor.linkedEntryById",
    message: "Links to entry #{id}",
    comment: "id: the linked entry's id, shown when its title is unknown",
  },
  linkedTermById: {
    id: "plugin.menu.itemEditor.linkedTermById",
    message: "Links to term #{id}",
    comment: "id: the linked term's id, shown when its title is unknown",
  },
} satisfies Record<string, MessageDescriptor>;

/**
 * Radix Select forbids an empty-string item value, so the "unassigned" choice
 * carries a sentinel that maps back to `null` (no menu) on change.
 */
export const UNASSIGNED_VALUE = "__unassigned__";

export type MenusPageState = "loading" | "empty" | "ready";

export function menusPageState(menus: {
  readonly isLoading: boolean;
  readonly data: readonly MenuListItem[] | undefined;
}): MenusPageState {
  if (menus.isLoading) return "loading";
  return (menus.data ?? []).length === 0 ? "empty" : "ready";
}

export function boundMenuSlug(
  boundTermId: number | null,
  menus: readonly MenuListItem[],
): string | null {
  if (boundTermId === null) return null;
  return menus.find((menu) => menu.id === boundTermId)?.slug ?? null;
}

export function locationCheckbox(
  boundTermId: number | null,
  termId: number,
  slug: string,
): { readonly checked: boolean; readonly toggleTo: string | null } {
  const checked = boundTermId === termId;
  return { checked, toggleTo: checked ? null : slug };
}

export function termSlugFromSelect(value: string): string | null {
  return value === UNASSIGNED_VALUE ? null : value;
}

function isReason(data: unknown, reason: string): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "reason" in data &&
    data.reason === reason
  );
}

/**
 * Dismissal is keyed to the version active at dismiss time, so a second
 * `version_mismatch` from another editor re-arms the banner.
 */
export function conflictShown(
  error: unknown,
  dismissedAt: number | null,
  version: number,
): boolean {
  const isVersionMismatch =
    error instanceof ORPCError && isReason(error.data, "version_mismatch");
  return isVersionMismatch && dismissedAt !== version;
}

/**
 * The reducer ignores a value below the deepest existing depth; this says so,
 * or the input displays a number the next save won't send.
 */
export function maxDepthRejected(draft: string, maxDepth: number): boolean {
  const parsed = Number.parseInt(draft, 10);
  return Number.isFinite(parsed) && parsed !== maxDepth;
}

export type PickerPanel =
  | { readonly panel: "custom" }
  | {
      readonly panel: "linked";
      readonly kind: "entry" | "term";
      readonly target: string;
    }
  | { readonly panel: "unsupported" };

/**
 * `MenuItemMeta` stores only custom, entry and term links, so a plugin lookup
 * kind has nowhere to keep what it would pick.
 */
export function pickerPanelFor(tab: PickerTab): PickerPanel {
  if (tab.kind === "custom") return { panel: "custom" };
  if (
    (tab.kind === "entry" || tab.kind === "term") &&
    tab.target !== undefined
  ) {
    return { panel: "linked", kind: tab.kind, target: tab.target };
  }
  return { panel: "unsupported" };
}

export type SearchResultsState = "loading" | "error" | "empty" | "results";

/** A narrower query is a new key, so it shows loading, not the last rows. */
export function searchResultsState(query: {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly data: { readonly items: readonly LinkTarget[] } | undefined;
}): SearchResultsState {
  if (query.isPending) return "loading";
  if (query.isError) return "error";
  return (query.data?.items ?? []).length === 0 ? "empty" : "results";
}

export function pickerChoice(
  kind: "entry" | "term",
  item: LinkTarget,
  relinkKey: ItemKey | null,
): { readonly action: EditorAction; readonly announcement: MessageDescriptor } {
  const meta =
    kind === "entry"
      ? { kind, entryId: Number(item.id) }
      : { kind, termId: Number(item.id) };
  if (relinkKey !== null) {
    return {
      action: {
        type: "relinkItem",
        key: relinkKey,
        newMeta: meta,
        linkedLabel: item.label,
      },
      announcement: M.replacedAnnouncement,
    };
  }
  return {
    // No title of its own: the item follows the linked title.
    action: { type: "addItem", title: null, meta, linkedLabel: item.label },
    announcement: M.addedAnnouncement,
  };
}

/**
 * Names what a linked item points at: its title when known, otherwise its
 * kind and id, so an untitled or vanished target isn't passed off as one
 * without a title.
 */
export function linkedTargetText(item: EditorItem): MessageDescriptor | null {
  const { meta } = item;
  if (meta.kind === "custom") return null;
  if (item.linkedLabel !== null) {
    return { ...M.linkedTarget, values: { label: item.linkedLabel } };
  }
  if (meta.kind === "entry") {
    return { ...M.linkedEntryById, values: { id: meta.entryId } };
  }
  return { ...M.linkedTermById, values: { id: meta.termId } };
}
