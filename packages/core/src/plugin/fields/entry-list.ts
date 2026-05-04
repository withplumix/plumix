import type { EntryListMetaBoxField, MetaBoxFieldSpan } from "../manifest.js";
import type { EntryFieldScope } from "./entry.js";

export interface EntryListFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: readonly string[];
  readonly span?: MetaBoxFieldSpan;
  readonly entryTypes: readonly string[];
  readonly includeTrashed?: boolean;
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Build a typed `entryList` reference field — the multi-value
 * counterpart to `entry()`. Storage is a JSON array of bare entry
 * ids (`["42", "43"]`); reads filter out orphans (the array stays
 * dense — missing IDs are dropped, not nulled). The admin renders
 * a `MultiReferencePicker` with drag-to-reorder; the picker stays
 * open until the author closes it or hits `max`.
 *
 * Reuses `EntryFieldScope` so the same `entryTypes` /
 * `includeTrashed` filters carry through to the entry adapter.
 */
export function entryList(
  options: EntryListFieldOptions,
): EntryListMetaBoxField {
  const scope: EntryFieldScope = {
    entryTypes: options.entryTypes,
    includeTrashed: options.includeTrashed,
  };
  return {
    key: options.key,
    label: options.label,
    type: "json",
    inputType: "entryList",
    referenceTarget: { kind: "entry", scope, multiple: true },
    max: options.max,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
  };
}
