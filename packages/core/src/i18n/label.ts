import type { I18n, MessageDescriptor } from "@lingui/core";

/** Manifest label fields accept either a plain string (legacy / static
 *  labels that don't need translation) or a Lingui `MessageDescriptor`
 *  (produced by `t\`...\`` or `defineMessage({ ... })`). Render sites
 *  go through `resolveLabel` to flatten both to a string. */
export type Label = string | MessageDescriptor;

/** Flatten `Label` → string via Lingui's resolver. */
export function resolveLabel(label: Label, instance: I18n): string {
  if (typeof label === "string") return label;
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
