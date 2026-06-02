import type { I18n, MessageDescriptor } from "@lingui/core";

/** Manifest label fields accept either a plain string (legacy / static
 *  labels that don't need translation) or a Lingui `MessageDescriptor`
 *  (produced by `t\`...\`` or `defineMessage({ ... })`). Render sites
 *  go through `resolveLabel` to flatten both to a string. */
export type Label = string | MessageDescriptor;

/** Resolve a `Label` to a rendered string against the given `i18n`
 *  instance. Strings pass through; descriptors hit Lingui's resolver,
 *  which falls back to `descriptor.message` when the active catalog
 *  has no translation for the id. */
export function resolveLabel(label: Label, instance: I18n): string {
  if (typeof label === "string") return label;
  return instance._(label);
}
