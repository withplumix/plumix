import type { JsonObject } from "@plumix/core";
import type { EntryFieldScope } from "@plumix/core/fields";

import type { LookupItem } from "./lookup/types.js";

// A picked entry stores its permalink as a plain URL, so renaming the entry
// doesn't retarget the link.

/**
 * Display-state view of the value. Absent optionals render as empty
 * string / off so the inputs stay controlled.
 */
export interface LinkDraft {
  readonly url: string;
  readonly label: string;
  readonly newTab: boolean;
}

export function linkDraftFromValue(value: unknown): LinkDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { url: "", label: "", newTab: false };
  }
  const { url, label, newTab } = value as JsonObject;
  return {
    url: typeof url === "string" ? url : "",
    label: typeof label === "string" ? label : "",
    newTab: newTab === true,
  };
}

/**
 * A draft without a URL stores `null`: the server rejects `{ url: "" }`, yet
 * link text typed first must survive in the UI.
 */
export function linkValueFromDraft(draft: LinkDraft): JsonObject | null {
  if (draft.url === "") return null;
  return {
    url: draft.url,
    ...(draft.label !== "" ? { label: draft.label } : {}),
    ...(draft.newTab ? { newTab: true } : {}),
  };
}

/**
 * Only published entries have a permalink worth storing — a draft's URL would
 * 404 (and go stale on slug edits). Undefined: nothing is pickable.
 */
export function linkPickerScope(
  publicEntryTypes: readonly string[],
): { readonly entryTypes: string[]; readonly status: "published" } | undefined {
  if (publicEntryTypes.length === 0) return undefined;
  // `satisfies` keeps the status literal tracking the `EntryStatus` vocabulary.
  return {
    entryTypes: [...publicEntryTypes],
    status: "published",
  } satisfies EntryFieldScope;
}

/** Only entries with a public URL can back a link value. */
export function pickableLinkItems(
  items: readonly LookupItem[],
): readonly LookupItem[] {
  return items.filter((item) => item.href !== undefined);
}
