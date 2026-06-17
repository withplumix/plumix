import type { I18n, MessageDescriptor } from "@lingui/core";

/** Manifest label fields accept either a plain string (legacy / static
 *  labels that don't need translation) or a Lingui `MessageDescriptor`
 *  (produced by `t\`...\`` or `defineMessage({ ... })`). Render sites
 *  go through `resolveLabel` to flatten both to a string. */
export type Label = string | MessageDescriptor;

/** Flatten `Label` → string via Lingui's resolver. */
export function resolveLabel(label: Label, instance: I18n): string {
  if (typeof label === "string") return label;
  // Descriptors whose id isn't in the active catalog (e.g. `@plumix/blocks`
  // field labels, not yet extracted into the admin catalog) would make Lingui
  // log an "uncompiled message" warning on every render. The authored source
  // message is the documented fallback, so return it directly rather than
  // routing through `instance._` and tripping that warning.
  if (instance.messages[label.id] === undefined) {
    return label.message ?? label.id;
  }
  return instance._(label);
}

/** Source-locale form of a `Label`. SSR-side companion to
 *  `resolveLabel` for contexts without an `i18n` instance — server
 *  sort comparators, route titles, plugin-eligibility predicates.
 *  Plain strings pass through; descriptors return `.message` (the
 *  English source the descriptor was authored with). */
export function labelSourceText(label: Label): string {
  if (typeof label === "string") return label;
  return label.message ?? "";
}
