import type { MetaBoxFieldSpan, TermListMetaBoxField } from "../manifest.js";
import type { TermFieldScope } from "./term.js";

export interface TermListFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: readonly string[];
  readonly span?: MetaBoxFieldSpan;
  readonly termTaxonomies: readonly string[];
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Build a typed `termList` reference field — the multi-value
 * counterpart to `term()`. Storage is a JSON array of bare term
 * ids (`["42", "43"]`); reads filter out orphans the same way
 * `entryList` does. The admin renders a `MultiReferencePicker`
 * with drag-to-reorder; the picker stays open until the author
 * closes it or hits `max`.
 *
 * Reuses `TermFieldScope` so the same `termTaxonomies` filter
 * carries through to the term adapter.
 */
export function termList(options: TermListFieldOptions): TermListMetaBoxField {
  const scope: TermFieldScope = {
    termTaxonomies: options.termTaxonomies,
  };
  return {
    key: options.key,
    label: options.label,
    type: "json",
    inputType: "termList",
    referenceTarget: { kind: "term", scope, multiple: true },
    max: options.max,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
  };
}
