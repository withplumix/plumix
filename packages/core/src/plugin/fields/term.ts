import { ReferenceFieldBuilder } from "./reference.js";

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
   * Seeded from the `term()` constructor argument.
   */
  readonly termTaxonomies: readonly string[];
}

/**
 * Build a typed `term` reference field —
 * `term("primary", ["category"])`. The required taxonomy scope is the
 * constructor's second argument; `.multiple()` flips to an id array.
 *
 * Storage is the bare term id (an id array under `.multiple()`). Reads
 * hydrate to the term summary by default (`.returns("id")` opts back
 * to the bare id); single reads stay optional (a target can orphan).
 * The admin renders a picker that calls the lookup RPC with
 * `{ kind: "term", scope }`.
 */
export function term<K extends string>(
  key: K,
  termTaxonomies: readonly string[],
): ReferenceFieldBuilder<"term", K> {
  return new ReferenceFieldBuilder("term", key, { termTaxonomies });
}
