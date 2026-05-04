import type {
  MetaBoxFieldSpan,
  TermReferenceMetaBoxField,
} from "../manifest.js";

/**
 * Public scope shape for the `term()` reference field. Carried on
 * the field's `referenceTarget.scope`; the term `LookupAdapter`
 * consumes it for write-time validation, picker filtering, and
 * read-time orphan resolution.
 */
export interface TermFieldScope {
  /**
   * Restrict matches to these taxonomies. Required at the field
   * level — term references without a taxonomy filter would surface
   * tags + categories + custom taxonomies in one indistinct list.
   */
  readonly termTaxonomies: readonly string[];
}

export interface TermFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  readonly termTaxonomies: readonly string[];
}

/**
 * Build a typed `term` reference field. Storage is the bare term id;
 * reads return the resolved label/subtitle (or `null` for orphans).
 * The admin renders a picker that calls the lookup RPC with
 * `{ kind: "term", scope: { termTaxonomies } }`.
 */
export function term(options: TermFieldOptions): TermReferenceMetaBoxField {
  const scope: TermFieldScope = {
    termTaxonomies: options.termTaxonomies,
  };
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "term",
    referenceTarget: { kind: "term", scope },
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
  };
}
