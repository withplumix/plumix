import { ReferenceFieldBuilder } from "./reference.js";

/**
 * Public scope shape for the `term()` reference field. Carried on
 * the field's `referenceTarget.scope`; the term `LookupAdapter`
 * consumes it for write-time validation, picker filtering, and
 * read-time orphan resolution.
 */
export interface TermFieldScope {
  /**
   * Required: without a taxonomy filter a picker would mix every taxonomy in
   * one list.
   */
  readonly termTaxonomies: readonly string[];
}

/**
 * Stores the bare term id. Reads hydrate to the term summary unless
 * `.returns("id")`; single reads stay optional because a target can orphan.
 */
export function term<K extends string>(
  key: K,
  termTaxonomies: readonly string[],
): ReferenceFieldBuilder<"term", K> {
  return new ReferenceFieldBuilder("term", key, { termTaxonomies });
}
