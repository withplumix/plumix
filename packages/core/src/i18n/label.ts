import type { I18n, MessageDescriptor } from "@lingui/core";

export type Label = string | MessageDescriptor;

/** Flatten `Label` → string via Lingui's resolver. */
export function resolveLabel(label: Label, instance: I18n): string {
  if (typeof label === "string") return label;
  // A descriptor missing from the active catalog would make Lingui warn on
  // every render; the source message is the documented fallback.
  if (instance.messages[label.id] === undefined) {
    return label.message ?? label.id;
  }
  return instance._(label);
}

/** For server contexts without an `i18n` instance. */
export function labelSourceText(label: Label): string {
  if (typeof label === "string") return label;
  return label.message ?? "";
}
