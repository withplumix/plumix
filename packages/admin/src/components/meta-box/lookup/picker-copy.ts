import { findEntryTypeByName, findTermTaxonomyByName } from "@/lib/manifest.js";
import {
  entryTypeLabel,
  GENERIC_ENTRY_TYPE_LABELS,
  termTaxonomyLabelOr,
} from "@/lib/type-labels.js";
import { defineMessage } from "@lingui/core/macro";

import type { JsonObject } from "@plumix/core";
import type { Label } from "@plumix/core/i18n";
import type { PlumixManifest } from "@plumix/core/manifest";

/** What a reference picker calls its search and its list states. */
export interface ReferencePickerCopy {
  readonly searchItems: Label;
  readonly notFound: Label;
  readonly noMatch: Label;
  readonly loadingItems: Label;
  readonly loadErrorItems: Label;
}

/** Users have no type manifest to carry labels, so their copy is fixed. */
const USER_COPY: ReferencePickerCopy = {
  searchItems: defineMessage({
    id: "metaBox.reference.user.searchItems",
    message: "Search users",
  }),
  notFound: defineMessage({
    id: "metaBox.reference.user.notFound",
    message: "No users yet",
  }),
  noMatch: defineMessage({
    id: "metaBox.reference.user.noMatch",
    message: "No users match",
  }),
  loadingItems: defineMessage({
    id: "metaBox.reference.user.loadingItems",
    message: "Loading users…",
  }),
  loadErrorItems: defineMessage({
    id: "metaBox.reference.user.loadErrorItems",
    message: "Couldn’t load users. Try again.",
  }),
};

/**
 * Whole phrases only: a lookup kind is a wire id, and gluing it or a type's
 * noun into a sentence breaks in every language that inflects.
 */
export function referencePickerCopy(
  kind: string,
  scope: JsonObject | undefined,
  manifest: PlumixManifest,
): ReferencePickerCopy {
  if (kind === "user") return USER_COPY;
  if (kind === "term") {
    const name = soleName(scope?.termTaxonomies);
    const taxonomy =
      name === undefined ? undefined : findTermTaxonomyByName(name, manifest);
    return copyOf((key) => termTaxonomyLabelOr(taxonomy, key));
  }
  if (kind === "entry") {
    const name = soleName(scope?.entryTypes);
    const type =
      name === undefined ? undefined : findEntryTypeByName(name, manifest);
    if (type) return copyOf((key) => entryTypeLabel(type, key));
  }
  return copyOf((key) => GENERIC_ENTRY_TYPE_LABELS[key]);
}

/** The one name a scope list holds, or `undefined` for none or several. */
function soleName(names: unknown): string | undefined {
  if (!Array.isArray(names) || names.length !== 1) return undefined;
  const [name] = names as unknown[];
  return typeof name === "string" ? name : undefined;
}

function copyOf(
  label: (key: keyof ReferencePickerCopy) => Label,
): ReferencePickerCopy {
  return {
    searchItems: label("searchItems"),
    notFound: label("notFound"),
    noMatch: label("noMatch"),
    loadingItems: label("loadingItems"),
    loadErrorItems: label("loadErrorItems"),
  };
}

/** The notice a picker's list shows instead of items, `null` when it has some. */
export function lookupListNotice(
  copy: ReferencePickerCopy,
  state: {
    readonly isLoading: boolean;
    readonly isError: boolean;
    readonly itemCount: number;
    readonly query: string;
  },
): Label | null {
  if (state.isLoading) return copy.loadingItems;
  if (state.isError) return copy.loadErrorItems;
  if (state.itemCount > 0) return null;
  return state.query.trim() === "" ? copy.notFound : copy.noMatch;
}
