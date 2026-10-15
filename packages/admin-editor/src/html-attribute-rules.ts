import { isAllowedHtmlAttr } from "@plumix/core/blocks";

/**
 * Common allowlisted attributes offered as suggestions. The field still accepts
 * any name `isAllowedHtmlAttr` permits (e.g. an arbitrary `data-*`/`aria-*`).
 */
const COMMON_ATTRS: readonly string[] = [
  "id",
  "title",
  "role",
  "lang",
  "dir",
  "aria-label",
  "aria-describedby",
  "aria-hidden",
  "aria-live",
  "data-testid",
];

/**
 * Lowercase throughout: the renderer keeps only the lowercased form (React
 * drops mixed-case data-/aria- props), so the editor offers and stores that.
 */
export function htmlAttrName(typed: string): string {
  return typed.trim().toLowerCase();
}

function lowercased(keys: readonly string[]): Set<string> {
  return new Set(keys.map((k) => k.toLowerCase()));
}

/** Whether an attribute row's key may become `to` (an {@link htmlAttrName});
 *  an invalid or no-op edit snaps back, and a sibling's key would be
 *  clobbered. */
export function canRenameHtmlAttr(
  from: string,
  to: string,
  siblingKeys: readonly string[],
): boolean {
  return (
    to !== from.toLowerCase() &&
    isAllowedHtmlAttr(to) &&
    !lowercased(siblingKeys).has(to)
  );
}

export interface HtmlAttrSuggestions {
  /** The common attributes not yet set. */
  readonly options: readonly string[];
  /** The typed attribute offered to create, or `null` when there is none. */
  readonly create: string | null;
}

export function htmlAttrSuggestions(
  query: string,
  existingKeys: readonly string[],
): HtmlAttrSuggestions {
  const taken = lowercased(existingKeys);
  const custom = htmlAttrName(query);
  return {
    options: COMMON_ATTRS.filter((attr) => !taken.has(attr)),
    create:
      isAllowedHtmlAttr(custom) &&
      !taken.has(custom) &&
      !COMMON_ATTRS.includes(custom)
        ? custom
        : null,
  };
}

export function canAddHtmlAttr(
  name: string,
  value: string,
  existingKeys: readonly string[],
): boolean {
  return (
    name !== "" && !lowercased(existingKeys).has(name) && value.trim() !== ""
  );
}
