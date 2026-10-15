import { CSS_PROPERTIES } from "./css-properties.js";

/**
 * A camelCase standard property (`marginTop`) or a CSS custom property
 * (`--brand-gap`) — stricter than the render guard, which also tolerates junk.
 */
const VALID_PROPERTY = /^(--)?[a-zA-Z][a-zA-Z-]*$/;

/** Whether a declaration row's key may become `to`; an invalid or no-op edit
 *  snaps back, and a sibling's key would be clobbered. */
export function canRenameDeclaration(
  from: string,
  to: string,
  siblingKeys: readonly string[],
): boolean {
  return to !== from && VALID_PROPERTY.test(to) && !siblingKeys.includes(to);
}

export interface DeclarationSuggestions {
  /** The curated properties not yet set. */
  readonly options: readonly string[];
  /** The typed property offered to create, or `null` when there is none. */
  readonly create: string | null;
}

export function declarationSuggestions(
  query: string,
  existingKeys: readonly string[],
): DeclarationSuggestions {
  const taken = new Set(existingKeys);
  // Case-insensitive: `margintop` must not create a second declaration
  // alongside the curated `marginTop`.
  const custom = query.trim();
  const known = new Set(
    [...CSS_PROPERTIES, ...existingKeys].map((p) => p.toLowerCase()),
  );
  return {
    options: CSS_PROPERTIES.filter((name) => !taken.has(name)),
    create:
      VALID_PROPERTY.test(custom) && !known.has(custom.toLowerCase())
        ? custom
        : null,
  };
}

/**
 * Re-checked at submit: the property can be set elsewhere after picking, and
 * the write overwrites unconditionally.
 */
export function canAddDeclaration(
  property: string,
  value: string,
  existingKeys: readonly string[],
): boolean {
  return (
    property !== "" && !existingKeys.includes(property) && value.trim() !== ""
  );
}
